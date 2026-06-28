'use strict';
const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

const DEFAULTS = { url: 'http://127.0.0.1:38217', token: '' };

async function load() {
  const s = await chrome.storage.local.get(DEFAULTS);
  $('url').value = s.url || DEFAULTS.url;
  $('token').value = s.token || '';
  ping();
}

function status(el, ok, text) {
  el.textContent = text;
  el.className = 'status ' + (ok ? 'ok' : 'bad');
}

async function ping() {
  send({ type: 'ping' }).then?.(() => {});
  chrome.runtime.sendMessage({ type: 'ping' }, (r) => {
    if (r && r.ok) status($('status'), true, '● Connected to JARVIS');
    else status($('status'), false, '● Not connected — check pairing');
  });
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ url: $('url').value.trim(), token: $('token').value.trim() });
  ping();
});

$('page').addEventListener('click', () =>
  chrome.runtime.sendMessage({ type: 'sendPage' }, (r) =>
    status($('status'), !r.error, r.error ? r.error : r.stored ? 'Page sent ✓' : 'Skipped (excluded/empty)')
  )
);

$('shot').addEventListener('click', () =>
  chrome.runtime.sendMessage({ type: 'sendScreenshot' }, (r) =>
    status($('status'), !r.error, r.error ? r.error : r.stored ? 'Screenshot sent ✓' : 'No text found')
  )
);

$('ask').addEventListener('click', () => {
  const question = $('q').value.trim();
  if (!question) return;
  $('answer').textContent = 'Thinking…';
  chrome.runtime.sendMessage({ type: 'ask', question }, (r) => {
    $('answer').className = 'status';
    $('answer').textContent = r.error ? 'Error: ' + r.error : (r.text || '').slice(0, 400);
  });
});

load();
