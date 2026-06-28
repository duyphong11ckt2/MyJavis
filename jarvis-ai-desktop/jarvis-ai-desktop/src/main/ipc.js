'use strict';
/**
 * IPC surface exposed to the renderer (through preload's contextBridge).
 * Each handler is a thin, validated wrapper over a service.
 */
const { ipcMain, Notification, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const config = require('../services/config');
const db = require('../services/db');
const memory = require('../services/memory');
const corrections = require('../services/corrections');
const automation = require('../services/automation');
const screenshots = require('../services/screenshots');
const llm = require('../services/llm');
const autostart = require('./autostart');
const { log } = require('../services/logger');

function notify(title, body) {
  if (!config.read('notifications')) return;
  try {
    new Notification({ title, body }).show();
  } catch (_) {}
}

function register({ emit }) {
  // ---- Config ----
  ipcMain.handle('config:get', () => config.all());
  ipcMain.handle('config:patch', (_e, patch) => {
    const next = config.patch(patch || {});
    if ('autoStart' in (patch || {})) autostart.set(next.autoStart);
    if ('screenshotLearning' in (patch || {})) {
      if (next.screenshotLearning) screenshots.start(emit);
      else screenshots.stop();
    }
    if ('globalHotkey' in (patch || {})) {
      try { require('./main').registerHotkey(); } catch (_) {}
    }
    if ('memoryRetentionDays' in (patch || {})) {
      try {
        const removed = db.purgeOld(next.memoryRetentionDays || 0);
        if (removed) emit({ type: 'cleanup', removed });
      } catch (_) {}
    }
    return next;
  });

  // ---- Chat / RAG ----
  ipcMain.handle('chat:ask', async (_e, { question, conversationId }) => {
    const d = db.get();
    let convId = conversationId;
    if (!convId) {
      convId = d
        .prepare('INSERT INTO conversations(title, created_at) VALUES (?,?)')
        .run(question.slice(0, 60), Date.now()).lastInsertRowid;
    }
    d.prepare('INSERT INTO messages(conversation_id, role, content, created_at) VALUES (?,?,?,?)')
      .run(convId, 'user', question, Date.now());

    const activeTag = config.read('activeTag') || null;
    const out = await memory.answer(question, { tag: activeTag });

    const msgId = d
      .prepare('INSERT INTO messages(conversation_id, role, content, sources, created_at) VALUES (?,?,?,?,?)')
      .run(convId, 'assistant', out.text, JSON.stringify(out.sources), Date.now()).lastInsertRowid;

    // Remember the exchange itself so future questions can recall it.
    await memory.ingest({
      kind: 'conversation',
      source: `conversation:${convId}`,
      title: question.slice(0, 80),
      content: `Q: ${question}\nA: ${out.text}`,
      tag: activeTag,
      metadata: { conversationId: convId }
    });

    return { ...out, conversationId: convId, messageId: msgId };
  });

  ipcMain.handle('chat:history', (_e, conversationId) =>
    db.get().prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id').all(conversationId)
  );
  ipcMain.handle('chat:conversations', () =>
    db.get().prepare('SELECT * FROM conversations ORDER BY created_at DESC LIMIT 100').all()
  );

  // ---- Feedback / corrections ----
  ipcMain.handle('feedback:up', (_e, messageId) => {
    corrections.setFeedback(messageId, 'up');
    return { ok: true };
  });
  ipcMain.handle('feedback:correct', async (_e, payload) => {
    const id = await corrections.addCorrection(payload);
    notify('Correction saved', 'JARVIS will use this from now on.');
    return { ok: true, id };
  });
  ipcMain.handle('corrections:list', () => corrections.list());

  // ---- Memory / ingest ----
  ipcMain.handle('memory:note', async (_e, { title, content }) => {
    const tag = config.read('activeTag') || null;
    const ids = await memory.ingest({ kind: 'note', source: 'user-note', title, content, tag });
    return { ok: true, chunks: ids.length };
  });
  ipcMain.handle('memory:uploadDocs', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Add documents to memory',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Text & docs', extensions: ['txt', 'md', 'csv', 'json', 'log', 'sql'] }]
    });
    if (canceled) return { ok: false, count: 0 };
    const tag = config.read('activeTag') || null;
    let count = 0;
    for (const fp of filePaths) {
      try {
        const text = fs.readFileSync(fp, 'utf8');
        await memory.ingest({
          kind: 'document',
          source: fp,
          title: path.basename(fp),
          content: text,
          tag
        });
        count++;
      } catch (e) {
        log.warn('Failed to ingest', fp, e.message);
      }
    }
    notify('Documents added', `${count} file(s) are now in memory.`);
    return { ok: true, count };
  });
  ipcMain.handle('memory:recent', (_e, kind) => memory.recent(kind, 60));
  ipcMain.handle('memory:stats', () => db.stats());

  // ---- Timeline (#4) ----
  ipcMain.handle('timeline:get', (_e, limit) => db.timeline(limit || 200));

  // ---- Daily summary (F) ----
  ipcMain.handle('summary:today', async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows = db
      .timeline(500)
      .filter((r) => r.created_at >= startOfDay.getTime());
    if (!rows.length) return { text: 'No activity recorded today yet.' };
    const lines = rows
      .slice(0, 120)
      .map((r) => {
        const t = new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${t} — ${r.source || r.kind}: ${r.title || ''}`;
      })
      .join('\n');
    try {
      const { text } = await llm.chat({
        system:
          'You summarize the user\'s work day from a timeline of app/screen activity. ' +
          'Write a short, friendly recap grouped by theme (3-7 bullet points). ' +
          'Focus on what they actually worked on; ignore noise and duplicates. Be concise.',
        messages: [{ role: 'user', content: `Today's activity:\n${lines}\n\nWrite the recap.` }]
      });
      return { text };
    } catch (e) {
      return { text: 'Could not reach the model to summarize. Raw activity:\n\n' + lines.slice(0, 1500) };
    }
  });

  // ---- Detected errors (#7) ----
  ipcMain.handle('errors:recent', () => {
    try {
      return db
        .get()
        .prepare(
          `SELECT id, source, title, content, created_at, metadata
           FROM memories
           WHERE kind='ocr' AND json_extract(metadata,'$.isError') = 1
           ORDER BY created_at DESC LIMIT 40`
        )
        .all();
    } catch (_) {
      return [];
    }
  });

  // ---- Housekeeping (#3) ----
  ipcMain.handle('memory:cleanupNow', () => {
    const removed = db.purgeOld(config.read('memoryRetentionDays') || 0);
    return { ok: true, removed };
  });

  // ---- Automation ----
  ipcMain.handle('automation:detect', () => automation.detectRepetitions());
  ipcMain.handle('automation:generate', (_e, payload) => automation.generate(payload));
  ipcMain.handle('automation:list', () => automation.list());
  ipcMain.handle('automation:status', (_e, { id, status }) => {
    automation.setStatus(id, status);
    return { ok: true };
  });
  ipcMain.handle('automation:save', async (_e, { id, language, script }) => {
    const win = BrowserWindow.getFocusedWindow();
    const ext = { python: 'py', powershell: 'ps1', batch: 'bat', playwright: 'mjs' }[language] || 'txt';
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save automation script',
      defaultPath: `jarvis-automation.${ext}`
    });
    if (canceled) return { ok: false };
    fs.writeFileSync(filePath, script, 'utf8');
    if (id) automation.setStatus(id, 'saved');
    return { ok: true, filePath };
  });

  // ---- Privacy ----
  ipcMain.handle('privacy:wipe', () => {
    db.wipeAll();
    notify('Memory cleared', 'All stored memories were deleted.');
    return { ok: true };
  });

  // ---- Diagnostics ----
  ipcMain.handle('diag:llm', () => llm.health());
  ipcMain.handle('diag:server', () => ({
    port: config.read('serverPort'),
    token: config.read('serverToken')
  }));

  log.info('IPC handlers registered.');
}

module.exports = { register, notify };
