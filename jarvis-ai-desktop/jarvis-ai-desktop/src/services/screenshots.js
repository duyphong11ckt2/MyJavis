'use strict';
/**
 * Screenshot learning.
 *
 * Capture method: Electron's built-in desktopCapturer (no external binaries,
 * no .bat helper). Works on Windows/macOS/Linux from the main process.
 *
 * Strategy (privacy-respecting and storage-light):
 *  1. Poll the screen at a modest interval, but only PROCESS a frame when it is
 *     "meaningfully different" from the previous one — measured by a downscaled
 *     perceptual hash (aHash). Idle screens cost almost nothing.
 *  2. On a meaningful change: run OCR locally, then ask the LLM to extract a
 *     small STRUCTURED record (app, task, errors, buttons, commands, step).
 *  3. Store only the structured text in memory. The raw image is discarded.
 *
 * Everything here is gated by Settings (screenshotLearning) and the privacy
 * exclusion list. The active app/window title check is a hook left for the
 * platform-specific module (see active-window note in DEVELOPER_GUIDE).
 */
const config = require('./config');
const privacy = require('./privacy');
const memory = require('./memory');
const ocr = require('./ocr');
const llm = require('./llm');
const activeWindow = require('./activeWindow');
const { log } = require('./logger');

let timer = null;
let lastHash = null;
let lastStored = null; // { appKey, taskKey, ts } for dedupe
let lastWindowKey = null; // app|title of last checked window (#3)
let lastCaptureTs = 0; // when we last took a real screenshot (#2/#3)
let busy = false;
let onEvent = () => {};

/**
 * Capture the primary display as a PNG buffer using Electron's desktopCapturer.
 * Requires the Electron app to be ready; only used from the main process.
 */
async function captureScreen() {
  const { desktopCapturer, screen } = require('electron');
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  const scale = primary.scaleFactor || 1;

  // Cap the captured resolution so OCR stays fast but legible.
  const maxW = 2560;
  const fullW = Math.round(width * scale);
  const fullH = Math.round(height * scale);
  const thumbW = Math.min(fullW, maxW);
  const thumbH = Math.round((thumbW / fullW) * fullH);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: thumbW, height: thumbH }
  });
  if (!sources || !sources.length) throw new Error('no screen source available');

  // Prefer the primary screen if its display_id matches; otherwise take first.
  let src = sources[0];
  const primaryId = String(primary.id);
  for (const s of sources) {
    if (String(s.display_id) === primaryId) { src = s; break; }
  }

  const png = src.thumbnail.toPNG();
  if (!png || !png.length) throw new Error('empty screen capture');
  return png;
}

/** 16x16 grayscale average hash from a screenshot buffer (via sharp). */
async function perceptualHash(buf) {
  const sharp = require('sharp');
  const size = 16;
  const raw = await sharp(buf).resize(size, size, { fit: 'fill' }).grayscale().raw().toBuffer();
  let sum = 0;
  for (let i = 0; i < raw.length; i++) sum += raw[i];
  const avg = sum / raw.length;
  const bits = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bits[i] = raw[i] >= avg ? 1 : 0;
  return bits;
}

function hammingRatio(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff / a.length;
}

const EXTRACT_PROMPT = `Extract a compact structured record from this on-screen text.
Return STRICT JSON only, no prose, with keys:
{"application":"","current_task":"","errors":[],"buttons":[],"commands":[],"workflow_step":""}
Rules:
- "errors" must ONLY contain genuine SOFTWARE error messages the application is showing
  right now (e.g. exceptions, failed operations, error dialogs, stack traces, HTTP 4xx/5xx,
  "cannot", "failed", "denied", "timeout", "not found"). 
- Do NOT treat normal business content as errors. Words like "incident", "ticket", "issue",
  "deleted", "review", "bug" appearing inside a document, ticket title, chat, or email are
  NOT errors — leave "errors" empty in that case.
- Keep each value short. Use [] when nothing applies.`;

// Strong signals that a string is a real application error, not business text.
const ERROR_SIGNAL = /(exception|stack ?trace|traceback|failed|failure|cannot|could not|denied|unauthorized|forbidden|timeout|timed out|null reference|undefined is not|is not a function|segmentation fault|fatal error|\bcrash|\bpanic\b|ora-\d+|sqlstate|err_[a-z]+|errno|http\s?[45]\d\d|status\s?[45]\d\d)/i;
// Phrases that look error-ish but are usually business content — require a real signal too.
const SOFT_WORDS = /\b(incident|ticket|issue|deleted|review|reopen|closure|bug)\b/i;

/** Keep only entries that read like genuine software errors. */
function filterRealErrors(errors, fullText) {
  const list = (errors || []).map((e) => String(e).trim()).filter(Boolean);
  const kept = list.filter((e) => {
    if (ERROR_SIGNAL.test(e)) return true;
    // If it only contains soft business words and no hard signal, drop it.
    if (SOFT_WORDS.test(e)) return false;
    return false;
  });
  // Extra guard: even if the model returned an error, require a hard signal
  // somewhere on screen, otherwise treat as no-error.
  if (kept.length && !ERROR_SIGNAL.test(fullText || '')) return [];
  return kept;
}

async function extractStructured(text) {
  if (!text || text.length < 12) return null;
  try {
    const { text: out } = await llm.chat({
      system: EXTRACT_PROMPT,
      messages: [{ role: 'user', content: text.slice(0, 4000) }]
    });
    const clean = out.replace(/```json|```/g, '').trim();
    const json = JSON.parse(clean);
    return json;
  } catch (e) {
    log.warn('Structured extraction failed, storing raw OCR snippet:', e.message);
    return null;
  }
}

/**
 * Surface a detected on-screen error: look for a past fix in memory/corrections,
 * show a desktop notification, and emit an event for the UI.
 */
async function raiseErrorAlert(errors, structured) {
  const summary = errors.join('; ').slice(0, 200);
  let suggestion = '';
  try {
    const hits = await memory.retrieve(summary, { topK: 3 });
    const best = hits.find((h) => h.kind === 'correction') || hits[0];
    if (best) suggestion = String(best.content).slice(0, 240);
  } catch (_) {}

  try {
    if (config.read('notifications')) {
      const { Notification } = require('electron');
      const body = suggestion
        ? `${summary}\n\nSeen before — suggestion: ${suggestion}`
        : summary;
      new Notification({ title: 'JARVIS: error detected on screen', body }).show();
    }
  } catch (_) {}

  onEvent({
    type: 'error-detected',
    app: structured?.application || null,
    task: structured?.current_task || null,
    errors,
    suggestion
  });
  log.info('Error alert raised: ' + summary);
}

async function processFrame() {
  if (busy) return;
  busy = true;
  try {
    // (#2) Pause when the user is away. powerMonitor.getSystemIdleTime() is
    // built into Electron (no native module) and returns seconds since the last
    // keyboard/mouse input. If idle beyond the threshold, do nothing this tick.
    let idleSec = 0;
    try { idleSec = require('electron').powerMonitor.getSystemIdleTime(); } catch (_) {}
    const idlePause = config.read('captureIdlePauseSec') ?? 60;
    if (idlePause > 0 && idleSec >= idlePause) { busy = false; return; }

    // (#3) Cheap active-window check BEFORE taking any screenshot.
    const win = await activeWindow.current(); // { app, title } on Windows; {} elsewhere
    const ctx = { app: win.app, title: win.title };
    if (!privacy.allow(ctx)) {
      log.info(`Skipped capture (excluded): ${win.app || ''} ${win.title || ''}`.trim());
      lastWindowKey = `${(win.app || '').toLowerCase()}|${(win.title || '').toLowerCase()}`;
      busy = false;
      return;
    }

    const winKey = `${(win.app || '').toLowerCase()}|${(win.title || '').toLowerCase()}`;
    const windowChanged = winKey !== lastWindowKey;
    const sameWindowMs = config.read('captureSameWindowMs') ?? 90000;
    const sinceCapture = Date.now() - (lastCaptureTs || 0);

    // Only spend a screenshot when the window changed, or enough time has passed
    // to re-check the same window. Otherwise skip cheaply (no screen grab).
    if (!windowChanged && sinceCapture < sameWindowMs) {
      busy = false;
      return;
    }
    lastWindowKey = winKey;

    const buf = await captureScreen();
    const hash = await perceptualHash(buf);
    const changed = hammingRatio(lastHash, hash);
    const threshold = config.read('screenshotChangeThreshold') ?? 0.12;
    // Same window: require a real visual change. New window: always proceed.
    if (!windowChanged && lastHash && changed < threshold) {
      busy = false;
      return;
    }
    lastHash = hash;

    const text = await ocr.recognize(buf);
    if (!text) {
      busy = false;
      return;
    }

    const structured = await extractStructured(text);
    const activeTag = config.read('activeTag') || null; // project label (#6)
    const realErrors = filterRealErrors(structured && structured.errors, text); // (A) real errors only
    const hasError = realErrors.length > 0;

    // (B) Deduplicate: skip if this is the same app+task as the last stored frame
    // within a short window (avoids many near-identical rows for one screen).
    const appKey = (structured?.application || win.app || 'screen').toLowerCase().trim();
    const taskKey = (structured?.current_task || win.title || '').toLowerCase().trim().slice(0, 80);
    const dedupeMs = config.read('screenshotDedupeMs') ?? 120000;
    const nowTs = Date.now();
    if (
      !hasError &&
      lastStored &&
      lastStored.appKey === appKey &&
      lastStored.taskKey === taskKey &&
      nowTs - lastStored.ts < dedupeMs
    ) {
      log.info(`Skipped duplicate capture: ${appKey} · ${taskKey}`);
      busy = false;
      return;
    }

    const content = structured
      ? `Application: ${structured.application}\n` +
        `Task: ${structured.current_task}\n` +
        `Errors: ${realErrors.join('; ')}\n` +
        `Buttons: ${(structured.buttons || []).join('; ')}\n` +
        `Commands: ${(structured.commands || []).join('; ')}\n` +
        `Workflow step: ${structured.workflow_step}`
      : text.slice(0, 1500);

    await memory.ingest({
      kind: 'ocr',
      source: structured?.application || win.app || 'screen',
      title: structured?.current_task || win.title || 'Screen capture',
      content,
      tag: activeTag,
      pinned: hasError ? 1 : 0, // keep errors around (skipped by auto-cleanup)
      metadata: {
        structured: !!structured,
        changeRatio: Number(changed.toFixed(3)),
        app: win.app || null,
        isError: hasError,
        errors: hasError ? realErrors : []
      }
    });
    lastStored = { appKey, taskKey, ts: nowTs };
    lastCaptureTs = nowTs;

    // Error detection (#7): alert + suggest a fix from past memory/corrections.
    if (hasError && config.read('errorAlerts')) {
      await raiseErrorAlert(realErrors, structured);
    }

    onEvent({ type: 'screenshot-learned', app: structured?.application, task: structured?.current_task });
    log.info('Learned from screen change. structured=' + !!structured + (hasError ? ' (error detected)' : ''));
  } catch (e) {
    log.warn('Screenshot frame error:', e.message);
  } finally {
    busy = false;
  }
}

function start(emit) {
  if (timer) return;
  onEvent = emit || (() => {});
  const interval = Math.max(config.read('screenshotMinIntervalMs') || 4000, 2000);
  timer = setInterval(processFrame, interval);
  log.info(`Screenshot learning started (interval ${interval}ms).`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  lastHash = null;
  lastStored = null;
  lastWindowKey = null;
  lastCaptureTs = 0;
  log.info('Screenshot learning stopped.');
}

function isRunning() {
  return !!timer;
}

module.exports = { start, stop, isRunning, _processFrame: processFrame };
