'use strict';
const { app } = require('electron');
const { log } = require('../services/logger');

function set(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: true,
      args: ['--hidden']
    });
    log.info('Auto-start set to', !!enabled);
  } catch (e) {
    log.warn('Failed to set auto-start:', e.message);
  }
}

function get() {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (_) {
    return false;
  }
}

module.exports = { set, get };
