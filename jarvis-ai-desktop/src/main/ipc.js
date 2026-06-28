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

    const out = await memory.answer(question);

    const msgId = d
      .prepare('INSERT INTO messages(conversation_id, role, content, sources, created_at) VALUES (?,?,?,?,?)')
      .run(convId, 'assistant', out.text, JSON.stringify(out.sources), Date.now()).lastInsertRowid;

    // Remember the exchange itself so future questions can recall it.
    await memory.ingest({
      kind: 'conversation',
      source: `conversation:${convId}`,
      title: question.slice(0, 80),
      content: `Q: ${question}\nA: ${out.text}`,
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
    const ids = await memory.ingest({ kind: 'note', source: 'user-note', title, content });
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
    let count = 0;
    for (const fp of filePaths) {
      try {
        const text = fs.readFileSync(fp, 'utf8');
        await memory.ingest({
          kind: 'document',
          source: fp,
          title: path.basename(fp),
          content: text
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
