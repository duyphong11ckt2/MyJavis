'use strict';
/**
 * Feedback & learning loop.
 *  - 👍 marks an answer correct (light signal, stored on the message).
 *  - 👎 collects the correct answer + reason + category and, once approved,
 *    writes it into long-term memory as a high-priority "correction" so future
 *    retrieval surfaces it above everything else.
 */
const db = require('./db');
const memory = require('./memory');
const { log } = require('./logger');

function setFeedback(messageId, value) {
  db.get().prepare('UPDATE messages SET feedback=? WHERE id=?').run(value, messageId);
}

/**
 * Record a correction. If approved (default true), it is also ingested into
 * memory so RAG can use it immediately.
 */
async function addCorrection({
  messageId = null,
  question,
  wrongAnswer = '',
  correctAnswer,
  reason = '',
  category = 'general',
  approved = true
}) {
  const d = db.get();
  const info = d
    .prepare(
      `INSERT INTO corrections(message_id, question, wrong_answer, correct_answer, reason, category, approved, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(messageId, question, wrongAnswer, correctAnswer, reason, category, approved ? 1 : 0, Date.now());

  if (messageId) setFeedback(messageId, 'down');

  if (approved) {
    const content =
      `Approved correction [${category}]\n` +
      `Question: ${question}\n` +
      `Correct answer: ${correctAnswer}\n` +
      (reason ? `Reason: ${reason}\n` : '');
    await memory.ingest({
      kind: 'correction',
      source: 'user-correction',
      title: `Correction: ${category}`,
      content,
      metadata: { category, correctionId: info.lastInsertRowid },
      pinned: 1
    });
    log.info('Approved correction ingested into long-term memory.');
  }
  return info.lastInsertRowid;
}

function list(limit = 100) {
  return db.get().prepare('SELECT * FROM corrections ORDER BY created_at DESC LIMIT ?').all(limit);
}

module.exports = { setFeedback, addCorrection, list };
