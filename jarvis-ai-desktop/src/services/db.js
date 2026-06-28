'use strict';
/**
 * Local database. SQLite via better-sqlite3 (synchronous, fast, embedded).
 *
 * Vectors are stored as raw Float32 BLOBs on the `memories` table and searched
 * in-process with cosine similarity (see memory.js). This keeps the install
 * portable — no native vector extension to compile or ship per-platform.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { log } = require('./logger');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- One row per remembered chunk of knowledge.
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,            -- document | conversation | correction | ocr | workflow | note | clipboard | browser
  source TEXT,                   -- file path, url, app name, etc.
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,                 -- JSON
  embedding BLOB,                -- Float32 vector
  dim INTEGER,
  created_at INTEGER NOT NULL,
  pinned INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);

-- Full-text fallback so retrieval still works before/without embeddings.
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content, title, source, content='memories', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, title, source)
  VALUES (new.id, new.content, new.title, new.source);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, title, source)
  VALUES ('delete', old.id, old.content, old.title, old.source);
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, title, source)
  VALUES ('delete', old.id, old.content, old.title, old.source);
  INSERT INTO memories_fts(rowid, content, title, source)
  VALUES (new.id, new.content, new.title, new.source);
END;

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,            -- user | assistant | system
  content TEXT NOT NULL,
  sources TEXT,                  -- JSON of memory ids used
  feedback TEXT,                 -- up | down | null
  created_at INTEGER NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER,
  question TEXT,
  wrong_answer TEXT,
  correct_answer TEXT NOT NULL,
  reason TEXT,
  category TEXT,
  approved INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- Raw activity events feed the workflow/automation detector.
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT,
  action TEXT,                   -- e.g. "copy", "screenshot", "page_visit"
  signature TEXT,                -- normalized fingerprint for repetition matching
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_sig ON activity(signature);

CREATE TABLE IF NOT EXISTS automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  trigger_signature TEXT,
  language TEXT,                 -- python | powershell | batch | playwright
  script TEXT,
  status TEXT DEFAULT 'suggested', -- suggested | saved | dismissed
  created_at INTEGER NOT NULL
);
`;

function open(userDataDir) {
  if (db) return db;
  const dir = path.join(userDataDir, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'jarvis.db');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // --- Lightweight migrations (safe to run every launch) ---
  migrate(db);
  db.prepare(
    `INSERT INTO schema_meta(key, value) VALUES('version', '1')
     ON CONFLICT(key) DO NOTHING`
  ).run();
  log.info('Database opened at', file);
  return db;
}

/** Add columns/indexes introduced after v1 without losing data. */
function migrate(d) {
  const cols = d.prepare(`PRAGMA table_info(memories)`).all().map((c) => c.name);
  if (!cols.includes('tag')) {
    d.exec(`ALTER TABLE memories ADD COLUMN tag TEXT`);
    log.info('Migration: added memories.tag column.');
  }
  d.exec(`CREATE INDEX IF NOT EXISTS idx_memories_tag ON memories(tag)`);
}

function get() {
  if (!db) throw new Error('Database not opened. Call open() first.');
  return db;
}

function wipeAll() {
  const d = get();
  d.exec(`
    DELETE FROM memories;
    DELETE FROM memories_fts;
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM corrections;
    DELETE FROM activity;
    DELETE FROM automations;
  `);
  d.exec('VACUUM;');
  log.warn('All stored memories wiped by user request.');
}

/**
 * Delete memories older than `days`, keeping anything pinned or of kind
 * 'correction' (trusted, user-approved knowledge is never auto-removed).
 * Returns the number of rows deleted. days<=0 is a no-op.
 */
function purgeOld(days) {
  const n = Number(days) || 0;
  if (n <= 0) return 0;
  const d = get();
  const cutoff = Date.now() - n * 24 * 60 * 60 * 1000;
  const info = d
    .prepare(
      `DELETE FROM memories
       WHERE created_at < ? AND pinned = 0 AND kind <> 'correction'`
    )
    .run(cutoff);
  if (info.changes) log.info(`Housekeeping: removed ${info.changes} memory row(s) older than ${n} day(s).`);
  return info.changes;
}

/** Recent activity for the Timeline view (newest first). */
function timeline(limit = 200) {
  const d = get();
  return d
    .prepare(
      `SELECT id, kind, source, title, content, tag, metadata, created_at
       FROM memories
       WHERE kind IN ('ocr','conversation','document','note','clipboard','browser')
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit);
}

function stats() {
  const d = get();
  const count = (t) => d.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  return {
    memories: count('memories'),
    conversations: count('conversations'),
    messages: count('messages'),
    corrections: count('corrections'),
    activity: count('activity'),
    automations: count('automations')
  };
}

module.exports = { open, get, wipeAll, stats, purgeOld, timeline };
