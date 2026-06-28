'use strict';
/**
 * Retrieval-Augmented Generation core.
 *
 * Ingest:   chunk text -> embed -> store as memory rows.
 * Retrieve: hybrid search = vector cosine + FTS keyword, merged and ranked.
 * Answer:   ALWAYS retrieve from memory first, then ask the LLM grounded in
 *           the retrieved context. Approved corrections are weighted highest.
 *
 * The LLM is never retrained; memory is the only thing that grows.
 */
const db = require('./db');
const emb = require('./embeddings');
const llm = require('./llm');
const config = require('./config');
const { log } = require('./logger');

function now() {
  return Date.now();
}

function chunk(text, size = 1100, overlap = 150) {
  const clean = (text || '').replace(/\s+\n/g, '\n').trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    // try to break on a sentence/newline boundary
    const slice = clean.slice(i, end);
    const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '));
    if (end < clean.length && lastBreak > size * 0.5) end = i + lastBreak + 1;
    chunks.push(clean.slice(i, end).trim());
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks.filter(Boolean);
}

/** Store a piece of knowledge. Returns the list of created memory ids. */
async function ingest({ kind, source = null, title = null, content, metadata = {}, pinned = 0, tag = null }) {
  const d = db.get();
  const pieces = chunk(content);
  const ids = [];
  const insert = d.prepare(
    `INSERT INTO memories(kind, source, title, content, metadata, embedding, dim, created_at, pinned, tag)
     VALUES (@kind,@source,@title,@content,@metadata,@embedding,@dim,@created_at,@pinned,@tag)`
  );
  for (const piece of pieces) {
    let embedding = null;
    let dim = 0;
    try {
      const vec = await emb.embed(piece);
      embedding = emb.toBlob(vec);
      dim = vec.length;
    } catch (e) {
      log.warn('Embedding failed for chunk, storing keyword-only:', e.message);
    }
    const info = insert.run({
      kind,
      source,
      title,
      content: piece,
      metadata: JSON.stringify(metadata || {}),
      embedding,
      dim,
      created_at: now(),
      pinned,
      tag: tag || null
    });
    ids.push(info.lastInsertRowid);
  }
  log.info(`Ingested ${ids.length} chunk(s) of kind=${kind} source=${source || '-'}${tag ? ' tag=' + tag : ''}`);
  return ids;
}

function ftsSearch(query, limit) {
  const d = db.get();
  // sanitize for FTS5: keep word chars, OR-join tokens
  const tokens = (query.match(/[\p{L}\p{N}_]+/gu) || []).filter((t) => t.length > 1);
  if (!tokens.length) return [];
  const match = tokens.map((t) => `"${t}"`).join(' OR ');
  try {
    return d
      .prepare(
        `SELECT m.id, m.kind, m.source, m.title, m.content, m.created_at, m.pinned,
                bm25(memories_fts) AS rank
         FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid
         WHERE memories_fts MATCH ?
         ORDER BY rank LIMIT ?`
      )
      .all(match, limit)
      .map((r) => ({ ...r, ftsRank: r.rank }));
  } catch (e) {
    log.warn('FTS search failed:', e.message);
    return [];
  }
}

/** Hybrid retrieval. Returns ranked memory rows with a `score` in [0,1]. */
async function retrieve(query, opts = {}) {
  const d = db.get();
  const topK = opts.topK || config.read('retrievalTopK') || 6;
  const minScore = opts.minScore ?? config.read('retrievalMinScore') ?? 0.25;
  const tag = opts.tag || null; // when set, scope to this project (corrections always apply)

  let qvec = null;
  try {
    qvec = await emb.embed(query);
  } catch (e) {
    log.warn('Query embedding failed, keyword-only retrieval:', e.message);
  }

  const inScope = (r) => !tag || r.tag === tag || r.kind === 'correction';
  const merged = new Map();

  // 1) Vector search over all rows that have an embedding.
  if (qvec) {
    const rows = d
      .prepare(
        `SELECT id, kind, source, title, content, metadata, embedding, created_at, pinned, tag
         FROM memories WHERE embedding IS NOT NULL`
      )
      .all();
    for (const r of rows) {
      if (!inScope(r)) continue;
      const score = emb.cosine(qvec, emb.fromBlob(r.embedding));
      const boost = r.kind === 'correction' ? 0.15 : r.pinned ? 0.08 : 0;
      merged.set(r.id, { ...r, score: Math.min(1, score + boost), via: 'vector' });
    }
  }

  // 2) Keyword search, folded in (helps exact terms like a copied SQL query).
  for (const r of ftsSearch(query, topK * 3)) {
    if (!inScope(r)) continue;
    const existing = merged.get(r.id);
    const kwScore = 0.45 + (r.kind === 'correction' ? 0.15 : 0);
    if (existing) existing.score = Math.max(existing.score, kwScore);
    else merged.set(r.id, { ...r, score: kwScore, via: 'keyword' });
  }

  return [...merged.values()]
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

const SYSTEM_PROMPT = `You are JARVIS, the user's private on-device assistant.
You answer using the CONTEXT below, which is retrieved from the user's own memory
(documents, past conversations, OCR text, workflow history, and approved corrections).
Rules:
- Prefer facts found in CONTEXT. Approved corrections override everything else.
- If the context does not contain the answer, say so plainly and answer from general
  knowledge, clearly noting it was not found in their memory.
- Be concise and concrete. Cite which sources you used by their [n] markers.`;

/** Full RAG answer. Memory is ALWAYS searched before the LLM is called. */
async function answer(question, opts = {}) {
  const hits = await retrieve(question, opts);
  const context = hits
    .map((h, i) => {
      const tag = `[${i + 1}] (${h.kind}${h.source ? ' · ' + h.source : ''})`;
      return `${tag}\n${h.content}`;
    })
    .join('\n\n');

  const messages = [
    {
      role: 'user',
      content: `CONTEXT:\n${context || '(no relevant memory found)'}\n\nQUESTION: ${question}`
    }
  ];

  let text;
  try {
    ({ text } = await llm.chat({ system: SYSTEM_PROMPT, messages }));
  } catch (e) {
    // Graceful degradation: still return the retrieved memory so the feature
    // is useful even with no LLM provider reachable.
    text =
      `I could not reach the language model (${e.message}), but here is the most ` +
      `relevant information from your memory:\n\n` +
      (hits.map((h, i) => `[${i + 1}] ${h.content}`).join('\n\n') || '(nothing found)');
  }

  return {
    text,
    sources: hits.map((h, i) => ({
      n: i + 1,
      id: h.id,
      kind: h.kind,
      source: h.source,
      title: h.title,
      score: Number(h.score.toFixed(3))
    }))
  };
}

function recent(kind, limit = 50) {
  const d = db.get();
  const q = kind
    ? d.prepare('SELECT * FROM memories WHERE kind=? ORDER BY created_at DESC LIMIT ?')
    : d.prepare('SELECT * FROM memories ORDER BY created_at DESC LIMIT ?');
  return kind ? q.all(kind, limit) : q.all(limit);
}

module.exports = { ingest, retrieve, answer, chunk, recent };
