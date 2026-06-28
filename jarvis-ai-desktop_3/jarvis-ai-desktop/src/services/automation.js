'use strict';
/**
 * Workflow automation.
 *
 * Detection: activity events carry a normalized `signature`. When the same
 * signature recurs above a threshold within a window, that workflow is flagged
 * as a repetition candidate.
 *
 * Generation: the LLM drafts a script in the requested language. Scripts are
 * ONLY ever suggested and saved — never executed. Execution is intentionally
 * not implemented anywhere in this app.
 */
const db = require('./db');
const llm = require('./llm');
const { log } = require('./logger');

const REPEAT_THRESHOLD = 3;
const WINDOW_MS = 1000 * 60 * 60 * 24 * 7; // one week

function logActivity({ app = null, action, signature, detail = '' }) {
  db.get()
    .prepare('INSERT INTO activity(app, action, signature, detail, created_at) VALUES (?,?,?,?,?)')
    .run(app, action, signature, detail, Date.now());
}

/** Returns signatures that repeated enough to be worth automating. */
function detectRepetitions() {
  const since = Date.now() - WINDOW_MS;
  return db
    .get()
    .prepare(
      `SELECT signature, COUNT(*) n, MAX(detail) sample, MAX(app) app
       FROM activity
       WHERE created_at >= ? AND signature IS NOT NULL AND signature != ''
       GROUP BY signature
       HAVING n >= ?
       ORDER BY n DESC
       LIMIT 10`
    )
    .all(since, REPEAT_THRESHOLD);
}

const GEN_PROMPT = (lang) => `You generate automation scripts for a Windows user.
Write a single, well-commented ${lang} script that automates the described
repetitive workflow. Output ONLY the script — no explanation, no code fences.
The script must be safe, idempotent where possible, and require no secrets
hard-coded. Assume it will be reviewed by the user before running.`;

const LANG_LABEL = {
  python: 'Python',
  powershell: 'PowerShell',
  batch: 'Windows Batch (.bat)',
  playwright: 'Playwright (Node.js)'
};

/** Draft an automation script. Persists it as a 'suggested' automation. */
async function generate({ description, language = 'python', signature = null, title = null }) {
  const lang = LANG_LABEL[language] || 'Python';
  let script = '';
  try {
    ({ text: script } = await llm.chat({
      system: GEN_PROMPT(lang),
      messages: [{ role: 'user', content: `Workflow to automate:\n${description}` }]
    }));
    script = script.replace(/^```[a-z]*\n?|```$/gim, '').trim();
  } catch (e) {
    log.warn('Automation generation failed:', e.message);
    script = `# Could not reach the language model (${e.message}).\n# Describe the steps and try again when a provider is available.`;
  }

  const info = db
    .get()
    .prepare(
      `INSERT INTO automations(title, description, trigger_signature, language, script, status, created_at)
       VALUES (?,?,?,?,?, 'suggested', ?)`
    )
    .run(title || description.slice(0, 60), description, signature, language, script, Date.now());

  return { id: info.lastInsertRowid, language, script };
}

function setStatus(id, status) {
  db.get().prepare('UPDATE automations SET status=? WHERE id=?').run(status, id);
}

function list(limit = 50) {
  return db.get().prepare('SELECT * FROM automations ORDER BY created_at DESC LIMIT ?').all(limit);
}

module.exports = { logActivity, detectRepetitions, generate, setStatus, list, LANG_LABEL };
