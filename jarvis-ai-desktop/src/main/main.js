'use strict';
const { app, globalShortcut } = require('electron');
const { init: initLog, log } = require('../services/logger');
initLog(app);

const lifecycle = require('./lifecycle');
const windows = require('./windows');
const tray = require('./tray');
const ipc = require('./ipc');
const autostart = require('./autostart');
const config = require('../services/config');
const db = require('../services/db');
const server = require('../services/server');
const screenshots = require('../services/screenshots');
const ocr = require('../services/ocr');

// Single-instance lock: focus the existing window instead of opening a 2nd app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => windows.show());

  lifecycle.installFatalHandler();

  app.whenReady().then(async () => {
    const checks = lifecycle.startupChecks();
    if (!checks.ok) {
      log.error('Startup checks failed; continuing in degraded mode.');
    }

    // Event sink: forward background events to the renderer.
    const emit = (payload) => {
      const win = windows.get();
      if (win && !win.isDestroyed()) win.webContents.send('jarvis:event', payload);
    };

    ipc.register({ emit });
    windows.create();
    tray.create(emit);
    server.start(emit);

    // Apply saved background settings.
    autostart.set(config.read('autoStart'));
    if (config.read('screenshotLearning')) screenshots.start(emit);

    // Global quick-open hotkey (works anywhere). Triple-Ctrl while focused is
    // handled in the renderer.
    registerHotkey();

    // Memory housekeeping (#3): purge old rows now, then once a day.
    runCleanup();
    setInterval(runCleanup, 24 * 60 * 60 * 1000);

    if (!config.read('firstRunComplete')) {
      config.write('firstRunComplete', true);
      log.info('First run completed; defaults applied (local-only, capture off).');
    }

    app.on('activate', () => windows.show());
  });

  // Keep running in the background (tray) when all windows are closed.
  app.on('window-all-closed', () => {
    if (!config.read('closeToTray')) app.quit();
    // otherwise: stay alive in the tray
  });

  app.on('before-quit', async () => {
    windows.setForceQuit(true);
    screenshots.stop();
    server.stop();
    try { globalShortcut.unregisterAll(); } catch (_) {}
    await ocr.terminate();
    log.info('JARVIS shutting down cleanly.');
  });
}

/** Register the configurable global accelerator to toggle the window. */
function registerHotkey() {
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
  const accel = config.read('globalHotkey');
  if (!accel) return;
  try {
    const ok = globalShortcut.register(accel, () => windows.toggle());
    log.info(`Global hotkey ${accel} ${ok ? 'registered' : 'NOT registered (in use?)'}.`);
  } catch (e) {
    log.warn('Failed to register global hotkey:', e.message);
  }
}

/** Apply the retention policy. Safe to call repeatedly. */
function runCleanup() {
  try {
    const days = config.read('memoryRetentionDays') || 0;
    const removed = db.purgeOld(days);
    if (removed) {
      const win = windows.get();
      if (win && !win.isDestroyed()) {
        win.webContents.send('jarvis:event', { type: 'cleanup', removed });
      }
    }
  } catch (e) {
    log.warn('Cleanup failed:', e.message);
  }
}

// Re-register the hotkey when settings change it.
module.exports = { registerHotkey };
