'use strict';
const path = require('path');
const { Tray, Menu, app, nativeImage } = require('electron');
const config = require('../services/config');
const windows = require('./windows');
const screenshots = require('../services/screenshots');
const { log } = require('../services/logger');

let tray = null;

function iconImage() {
  const p = path.join(__dirname, '..', '..', 'resources', 'tray.png');
  const img = nativeImage.createFromPath(p);
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function buildMenu(emit) {
  const learning = config.read('screenshotLearning');
  return Menu.buildFromTemplate([
    { label: 'Open JARVIS', click: () => windows.show() },
    { type: 'separator' },
    {
      label: 'Screenshot learning',
      type: 'checkbox',
      checked: !!learning,
      click: (item) => {
        config.write('screenshotLearning', item.checked);
        if (item.checked) screenshots.start(emit);
        else screenshots.stop();
        refresh(emit);
      }
    },
    {
      label: 'Notifications',
      type: 'checkbox',
      checked: !!config.read('notifications'),
      click: (item) => config.write('notifications', item.checked)
    },
    { type: 'separator' },
    {
      label: 'Quit JARVIS',
      click: () => {
        windows.setForceQuit(true);
        app.quit();
      }
    }
  ]);
}

function create(emit) {
  if (tray) return tray;
  try {
    tray = new Tray(iconImage());
    tray.setToolTip('JARVIS AI Desktop');
    tray.setContextMenu(buildMenu(emit));
    tray.on('double-click', () => windows.show());
    log.info('System tray created.');
  } catch (e) {
    log.warn('Tray creation failed:', e.message);
  }
  return tray;
}

function refresh(emit) {
  if (tray) tray.setContextMenu(buildMenu(emit));
}

module.exports = { create, refresh };
