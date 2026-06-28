'use strict';
/**
 * Local bridge between the browser extension and the desktop app.
 *
 * Security model:
 *  - Binds to 127.0.0.1 only (never reachable off the machine).
 *  - Every request must carry the per-install bearer token (config.serverToken).
 *  - CORS is restricted to extension origins.
 *  - Privacy exclusions are enforced before anything is stored.
 */
const express = require('express');
const config = require('./config');
const privacy = require('./privacy');
const memory = require('./memory');
const automation = require('./automation');
const ocr = require('./ocr');
const { log } = require('./logger');

let server = null;
let emit = () => {};

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // CORS limited to browser-extension origins.
  app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    if (/^chrome-extension:\/\//.test(origin) || /^moz-extension:\/\//.test(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Token auth on everything except the health ping.
  app.use((req, res, next) => {
    if (req.path === '/ping') return next();
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token !== config.read('serverToken')) return res.status(401).json({ error: 'unauthorized' });
    next();
  });

  app.get('/ping', (_req, res) => res.json({ app: 'jarvis', ok: true }));

  // Receive page context from the extension.
  app.post('/capture/page', async (req, res) => {
    try {
      const { url, title, text, selection, incognito } = req.body || {};
      if (!privacy.allow({ url, incognito })) {
        return res.json({ stored: false, reason: 'excluded' });
      }
      const content =
        (selection ? `Selected text:\n${selection}\n\n` : '') + (text ? text.slice(0, 12000) : '');
      if (!content.trim()) return res.json({ stored: false, reason: 'empty' });
      const ids = await memory.ingest({
        kind: 'browser',
        source: url,
        title: title || url,
        content,
        metadata: { url, title }
      });
      automation.logActivity({ app: 'browser', action: 'page_visit', signature: `visit:${hostOf(url)}`, detail: title });
      emit({ type: 'captured', kind: 'browser', title });
      res.json({ stored: true, chunks: ids.length });
    } catch (e) {
      log.warn('capture/page error', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Receive an on-demand screenshot (base64 PNG) from the extension.
  app.post('/capture/screenshot', async (req, res) => {
    try {
      const { url, title, dataUrl, incognito } = req.body || {};
      if (!privacy.allow({ url, incognito })) return res.json({ stored: false, reason: 'excluded' });
      const b64 = (dataUrl || '').split(',')[1];
      if (!b64) return res.status(400).json({ error: 'no image' });
      const buf = Buffer.from(b64, 'base64');
      const text = await ocr.recognize(buf);
      if (!text) return res.json({ stored: false, reason: 'no-text' });
      const ids = await memory.ingest({
        kind: 'ocr',
        source: url || 'browser-screenshot',
        title: title || 'Browser screenshot',
        content: text,
        metadata: { url }
      });
      emit({ type: 'captured', kind: 'ocr', title });
      res.json({ stored: true, chunks: ids.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Let the extension query memory directly.
  app.post('/ask', async (req, res) => {
    try {
      const { question } = req.body || {};
      const out = await memory.answer(question);
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return app;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return 'unknown';
  }
}

function start(emitFn) {
  if (server) return;
  emit = emitFn || (() => {});
  const port = config.read('serverPort') || 38217;
  server = makeApp().listen(port, '127.0.0.1', () => {
    log.info(`Extension bridge listening on http://127.0.0.1:${port}`);
  });
  server.on('error', (e) => log.error('Bridge server error:', e.message));
}

function stop() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { start, stop };
