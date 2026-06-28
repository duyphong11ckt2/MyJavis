'use strict';
/**
 * Centralized logging. Wraps electron-log so the whole app writes to one
 * rotating file, plus stdout in development. Also installs handlers that turn
 * uncaught exceptions / rejections into log lines instead of silent crashes.
 */
const log = require('electron-log');

let initialized = false;

function init(app) {
  if (initialized) return log;
  initialized = true;

  log.transports.file.level = 'info';
  log.transports.console.level = process.env.JARVIS_ENV === 'development' ? 'debug' : 'warn';
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB then rotate
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

  // electron-log already chooses userData/logs/main.log by default.
  if (app) {
    try {
      const path = require('path');
      log.transports.file.resolvePathFn = () =>
        path.join(app.getPath('userData'), 'logs', 'jarvis.log');
    } catch (_) {
      /* renderer-side use: keep defaults */
    }
  }

  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', reason);
  });

  return log;
}

module.exports = { log, init };
