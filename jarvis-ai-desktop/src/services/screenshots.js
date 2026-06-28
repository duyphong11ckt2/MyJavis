'use strict';
/**
 * Screenshot learning.
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
const { log } = require('./logger');

let timer = null;
let lastHash = null;
let busy = false;
let onEvent = () => {};

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
Keep each value short. Use [] when nothing applies.`;

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

async function processFrame() {
  if (busy) return;
  busy = true;
  try {
    const screenshot = require('screenshot-desktop');
    const buf = await screenshot({ format: 'png' });
    const hash = await perceptualHash(buf);
    const changed = hammingRatio(lastHash, hash);
    const threshold = config.read('screenshotChangeThreshold') ?? 0.12;

    if (lastHash && changed < threshold) {
      busy = false;
      return; // not a meaningful change
    }
    lastHash = hash;

    // Active-app gating hook: platform module may set these. Default allows.
    const ctx = {}; // { app, url, incognito } when an active-window provider is wired
    if (!privacy.allow(ctx)) {
      busy = false;
      return;
    }

    const text = await ocr.recognize(buf);
    if (!text) {
      busy = false;
      return;
    }

    const structured = await extractStructured(text);
    const content = structured
      ? `Application: ${structured.application}\n` +
        `Task: ${structured.current_task}\n` +
        `Errors: ${(structured.errors || []).join('; ')}\n` +
        `Buttons: ${(structured.buttons || []).join('; ')}\n` +
        `Commands: ${(structured.commands || []).join('; ')}\n` +
        `Workflow step: ${structured.workflow_step}`
      : text.slice(0, 1500);

    await memory.ingest({
      kind: 'ocr',
      source: structured?.application || 'screen',
      title: structured?.current_task || 'Screen capture',
      content,
      metadata: { structured: !!structured, changeRatio: Number(changed.toFixed(3)) }
    });

    onEvent({ type: 'screenshot-learned', app: structured?.application, task: structured?.current_task });
    log.info('Learned from screen change. structured=' + !!structured);
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
  log.info('Screenshot learning stopped.');
}

function isRunning() {
  return !!timer;
}

module.exports = { start, stop, isRunning, _processFrame: processFrame };
