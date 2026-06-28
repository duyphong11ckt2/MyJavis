'use strict';
/**
 * Local OCR via tesseract.js. Runs on-device; no image leaves the machine.
 * The worker is created lazily and reused. Language data caches into userData.
 */
const { log } = require('./logger');

let workerPromise = null;

async function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const { createWorker } = require('tesseract.js');
    let cachePath;
    try {
      const { app } = require('electron');
      const path = require('path');
      cachePath = path.join(app.getPath('userData'), 'tessdata');
    } catch (_) {
      cachePath = undefined;
    }
    log.info('Initializing OCR worker...');
    const worker = await createWorker('eng', 1, cachePath ? { cachePath } : {});
    return worker;
  })();
  return workerPromise;
}

/** OCR a PNG/JPEG buffer or file path. Returns plain text. */
async function recognize(image) {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    return (data.text || '').trim();
  } catch (e) {
    log.warn('OCR failed:', e.message);
    return '';
  }
}

async function terminate() {
  if (workerPromise) {
    try {
      (await workerPromise).terminate();
    } catch (_) {}
    workerPromise = null;
  }
}

module.exports = { recognize, terminate };
