'use strict';
const path = require('path');
const { BrowserWindow, shell } = require('electron');
const config = require('../services/config');

let win = null;
let forceQuit = false;

function create() {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }

  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0d1117',
    title: 'JARVIS AI Desktop',
    icon: path.join(__dirname, '..', '..', 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win.show();
  });

  // Open external links in the system browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Close-to-tray: hide instead of quitting unless the user truly exits.
  win.on('close', (e) => {
    if (!forceQuit && config.read('closeToTray')) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

function get() {
  return win;
}

function show() {
  const w = create();
  w.show();
  w.focus();
}

/** Show & focus if hidden/blurred; hide if currently focused. */
function toggle() {
  if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) {
    if (config.read('closeToTray')) win.hide();
    else win.minimize();
    return;
  }
  const w = create();
  w.show();
  w.focus();
  // Ask the renderer to jump straight to the Ask box.
  try {
    w.webContents.send('jarvis:event', { type: 'quick-open' });
  } catch (_) {}
}

function setForceQuit(v) {
  forceQuit = v;
}

module.exports = { create, get, show, toggle, setForceQuit };
