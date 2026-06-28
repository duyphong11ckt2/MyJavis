'use strict';
/**
 * Startup checks and crash recovery.
 *  - Verifies the data dir is writable and the DB opens (recovers if WAL is
 *    corrupt by backing up and recreating).
 *  - Ensures config + server token exist.
 *  - Surfaces a friendly dialog instead of a silent crash on fatal errors.
 */
const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const db = require('../services/db');
const config = require('../services/config');
const { log } = require('../services/logger');

function ensureWritable(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, '.write-test');
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
}

function startupChecks() {
  const userData = app.getPath('userData');
  const results = { ok: true, steps: [] };

  try {
    ensureWritable(userData);
    results.steps.push('userData writable');
  } catch (e) {
    results.ok = false;
    results.steps.push('userData NOT writable: ' + e.message);
    return results;
  }

  // Open DB, recovering if needed.
  try {
    db.open(userData);
    db.stats();
    results.steps.push('database ready');
  } catch (e) {
    log.error('DB open failed, attempting recovery:', e.message);
    try {
      const dbFile = path.join(userData, 'data', 'jarvis.db');
      if (fs.existsSync(dbFile)) {
        const backup = dbFile + '.corrupt-' + Date.now();
        fs.renameSync(dbFile, backup);
        log.warn('Backed up corrupt DB to', backup);
      }
      db.open(userData);
      results.steps.push('database recovered (fresh)');
    } catch (e2) {
      results.ok = false;
      results.steps.push('database unrecoverable: ' + e2.message);
    }
  }

  // Config + token.
  config.get();
  results.steps.push('config loaded; first run=' + !config.read('firstRunComplete'));

  log.info('Startup checks:', JSON.stringify(results.steps));
  return results;
}

function installFatalHandler() {
  process.on('uncaughtException', (err) => {
    log.error('FATAL uncaughtException:', err);
    try {
      dialog.showErrorBox(
        'JARVIS hit an unexpected error',
        `${err.message}\n\nThe app will keep running where possible. A full log is in:\n` +
          path.join(app.getPath('userData'), 'logs', 'jarvis.log')
      );
    } catch (_) {}
  });
}

module.exports = { startupChecks, installFatalHandler };
