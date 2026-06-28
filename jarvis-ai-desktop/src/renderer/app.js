'use strict';
/* global jarvis */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let currentConversation = null;
let pendingCorrection = null; // { messageId, question, wrongAnswer }

// ---------- Navigation ----------
$$('.nav').forEach((btn) =>
  btn.addEventListener('click', () => {
    $$('.nav').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    $$('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== view));
    if (view === 'memory') loadMemory();
    if (view === 'timeline') loadTimeline();
    if (view === 'corrections') loadCorrections();
    if (view === 'automation') loadDetected();
    if (view === 'settings') loadSettings();
  })
);

function goToView(view) {
  const btn = document.querySelector(`.nav[data-view="${view}"]`);
  if (btn) btn.click();
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fmtTime(ms) {
  return new Date(ms).toLocaleString();
}

// ---------- Chat ----------
const chatScroll = $('#chatScroll');
const chatInput = $('#chatInput');

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
});
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
$('#chatSend').addEventListener('click', send);

function addBubble(role, text, opts = {}) {
  const empty = $('#chatEmpty');
  if (empty) empty.remove();
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  msg.appendChild(bubble);
  chatScroll.appendChild(msg);
  chatScroll.scrollTop = chatScroll.scrollHeight;
  return { msg, bubble };
}

function renderSources(msgEl, sources) {
  if (!sources || !sources.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'sources';
  sources.forEach((s) => {
    const chip = document.createElement('span');
    chip.className = 'src-chip';
    chip.innerHTML = `<b>[${s.n}]</b> ${escapeHtml(s.kind)}${s.source ? ' · ' + escapeHtml(String(s.source).slice(0, 40)) : ''}`;
    wrap.appendChild(chip);
  });
  msgEl.appendChild(wrap);
}

function renderFeedback(msgEl, messageId, question, answer) {
  const fb = document.createElement('div');
  fb.className = 'fb';
  const up = document.createElement('button');
  up.textContent = '👍 Correct';
  const down = document.createElement('button');
  down.textContent = '👎 Wrong';
  up.addEventListener('click', async () => {
    await jarvis.feedback.up(messageId);
    up.classList.add('chosen-up');
    down.disabled = true;
    toast('Thanks — marked correct.');
  });
  down.addEventListener('click', () => {
    pendingCorrection = { messageId, question, wrongAnswer: answer };
    $('#corrModal').classList.remove('hidden');
    $('#corrAnswer').focus();
  });
  fb.append(up, down);
  msgEl.appendChild(fb);
}

async function send() {
  const q = chatInput.value.trim();
  if (!q) return;
  chatInput.value = '';
  chatInput.style.height = 'auto';
  addBubble('user', q);
  const { msg, bubble } = addBubble('assistant', 'Searching your memory…');
  bubble.classList.add('thinking');
  try {
    const res = await jarvis.chat.ask(q, currentConversation);
    currentConversation = res.conversationId;
    bubble.classList.remove('thinking');
    bubble.textContent = res.text;
    renderSources(msg, res.sources);
    renderFeedback(msg, res.messageId, q, res.text);
    chatScroll.scrollTop = chatScroll.scrollHeight;
  } catch (e) {
    bubble.classList.remove('thinking');
    bubble.textContent = 'Something went wrong: ' + e.message;
  }
}

// Correction modal
$('#corrCancel').addEventListener('click', () => $('#corrModal').classList.add('hidden'));
$('#corrApprove').addEventListener('click', async () => {
  const correctAnswer = $('#corrAnswer').value.trim();
  if (!correctAnswer) return toast('Please enter the correct answer.');
  await jarvis.feedback.correct({
    messageId: pendingCorrection.messageId,
    question: pendingCorrection.question,
    wrongAnswer: pendingCorrection.wrongAnswer,
    correctAnswer,
    reason: $('#corrReason').value.trim(),
    category: $('#corrCategory').value.trim() || 'general',
    approved: true
  });
  $('#corrModal').classList.add('hidden');
  $('#corrAnswer').value = $('#corrReason').value = $('#corrCategory').value = '';
  toast('Correction saved to long-term memory.');
});

// ---------- Memory ----------
let memKind = '';
$$('#memFilters .chip').forEach((c) =>
  c.addEventListener('click', () => {
    $$('#memFilters .chip').forEach((x) => x.classList.remove('active'));
    c.classList.add('active');
    memKind = c.dataset.kind;
    loadMemory();
  })
);
$('#addDocs').addEventListener('click', async () => {
  const r = await jarvis.memory.uploadDocs();
  if (r.ok) toast(`Added ${r.count} document(s).`);
  loadMemory();
});
$('#addNote').addEventListener('click', async () => {
  const content = prompt('Note to remember:');
  if (!content) return;
  await jarvis.memory.note({ title: content.slice(0, 40), content });
  toast('Note saved.');
  loadMemory();
});

async function loadMemory() {
  const stats = await jarvis.memory.stats();
  $('#memStats').textContent = `${stats.memories} chunks · ${stats.conversations} chats · ${stats.corrections} corrections`;
  const rows = await jarvis.memory.recent(memKind || undefined);
  const list = $('#memList');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = `<div class="empty" style="margin:40px auto">Nothing here yet.</div>`;
    return;
  }
  rows.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-top">
        <span class="kind-tag">${escapeHtml(r.kind)}</span>
        <span class="card-title">${escapeHtml(r.title || '(untitled)')}</span>
        <span class="card-src">${escapeHtml(r.source || '')}</span>
      </div>
      <div class="card-body">${escapeHtml(r.content)}</div>
      <div class="card-time">${fmtTime(r.created_at)}</div>`;
    list.appendChild(card);
  });
}

// ---------- Corrections ----------
async function loadCorrections() {
  const rows = await jarvis.feedback.list();
  const list = $('#corrList');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = `<div class="empty" style="margin:40px auto">No corrections yet. Use 👎 on an answer to teach JARVIS.</div>`;
    return;
  }
  rows.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-top">
        <span class="kind-tag">${escapeHtml(r.category || 'general')}</span>
        <span class="card-title">${escapeHtml(r.question || '')}</span>
      </div>
      <div class="card-body"><b style="color:var(--good)">✓ ${escapeHtml(r.correct_answer)}</b>${r.reason ? '<br>' + escapeHtml(r.reason) : ''}</div>
      <div class="card-time">${fmtTime(r.created_at)}</div>`;
    list.appendChild(card);
  });
}

// ---------- Automation ----------
let lastAuto = null;
$('#autoGen').addEventListener('click', async () => {
  const description = $('#autoDesc').value.trim();
  if (!description) return toast('Describe the workflow first.');
  $('#autoGen').disabled = true;
  $('#autoGen').textContent = 'Drafting…';
  try {
    const r = await jarvis.automation.generate({ description, language: $('#autoLang').value });
    lastAuto = r;
    $('#autoOut').classList.remove('hidden');
    $('#autoOut').querySelector('code').textContent = r.script;
    $('#autoActions').classList.remove('hidden');
  } catch (e) {
    toast('Generation failed: ' + e.message);
  } finally {
    $('#autoGen').disabled = false;
    $('#autoGen').textContent = 'Draft script';
  }
});
$('#autoSave').addEventListener('click', async () => {
  if (!lastAuto) return;
  const r = await jarvis.automation.save({ id: lastAuto.id, language: lastAuto.language, script: lastAuto.script });
  if (r.ok) toast('Saved: ' + r.filePath);
});

async function loadDetected() {
  const rows = await jarvis.automation.detect();
  const box = $('#autoDetected');
  box.innerHTML = '';
  if (!rows.length) return;
  const head = document.createElement('div');
  head.style.cssText = 'color:var(--text-faint);font-size:12px;margin-bottom:4px';
  head.textContent = 'Repetitive workflows JARVIS noticed:';
  box.appendChild(head);
  rows.forEach((r) => {
    const d = document.createElement('div');
    d.className = 'd';
    d.innerHTML = `<span><b>${r.n}×</b> ${escapeHtml(r.app || 'activity')} · ${escapeHtml(r.sample || r.signature)}</span>`;
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'Draft automation';
    btn.addEventListener('click', () => {
      $('#autoDesc').value = `Automate this repeated workflow: ${r.sample || r.signature}`;
      $('#autoGen').click();
    });
    d.appendChild(btn);
    box.appendChild(d);
  });
}

// ---------- Project tags (#6) ----------
async function loadTagBar() {
  const bar = $('#tagBar');
  if (!bar) return;
  const cfg = await jarvis.config.get();
  const tags = cfg.tags || [];
  const active = cfg.activeTag || '';
  bar.innerHTML = '<span class="tagbar-label">Project:</span>';
  const mk = (label, value) => {
    const b = document.createElement('button');
    b.className = 'tagpill' + (value === active ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', async () => {
      await jarvis.config.patch({ activeTag: value });
      loadTagBar();
      toast(value ? `Project: ${value}` : 'Showing all projects');
    });
    return b;
  };
  bar.appendChild(mk('All', ''));
  tags.forEach((t) => bar.appendChild(mk(t, t)));
  const add = document.createElement('button');
  add.className = 'tagpill add';
  add.textContent = '＋ New';
  add.addEventListener('click', async () => {
    const name = (prompt('New project label:') || '').trim();
    if (!name) return;
    const next = [...new Set([...(cfg.tags || []), name])];
    await jarvis.config.patch({ tags: next, activeTag: name });
    loadTagBar();
  });
  bar.appendChild(add);
}

// ---------- Timeline (#4) ----------
function dayLabel(ms) {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString();
}

async function loadTimeline() {
  const rows = await jarvis.timeline.get(200);
  const list = $('#timelineList');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = `<div class="empty" style="margin:40px auto">Nothing recorded yet. Turn on Screenshot learning and work for a bit.</div>`;
    return;
  }
  let lastDay = null;
  rows.forEach((r) => {
    let meta = {};
    try { meta = JSON.parse(r.metadata || '{}'); } catch (_) {}
    const day = dayLabel(r.created_at);
    if (day !== lastDay) {
      lastDay = day;
      const h = document.createElement('div');
      h.className = 'tl-day';
      h.textContent = day;
      list.appendChild(h);
    }
    const item = document.createElement('div');
    item.className = 'tl-item' + (meta.isError ? ' error' : '');
    const time = new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    item.innerHTML = `
      <div class="tl-time">${time}</div>
      <div class="tl-dot"></div>
      <div class="tl-body">
        <div class="tl-title">${meta.isError ? '⚠ ' : ''}${escapeHtml(r.title || r.source || r.kind)}${r.tag ? ` <span class="tl-tag">${escapeHtml(r.tag)}</span>` : ''}</div>
        <div class="tl-sub">${escapeHtml(r.kind)}${r.source ? ' · ' + escapeHtml(String(r.source).slice(0, 50)) : ''}</div>
      </div>`;
    list.appendChild(item);
  });
}

// ---------- Quick-open: triple-Ctrl while focused ----------
let ctrlTaps = [];
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Control') return;
  const now = Date.now();
  ctrlTaps = ctrlTaps.filter((t) => now - t < 600);
  ctrlTaps.push(now);
  if (ctrlTaps.length >= 3) {
    ctrlTaps = [];
    goToView('chat');
    setTimeout(() => chatInput.focus(), 50);
  }
});


function rowToggle(key, title, desc, cfg) {
  return `<div class="row"><div class="label"><div class="t">${title}</div><div class="d">${desc}</div></div>
    <label class="switch"><input type="checkbox" data-key="${key}" ${cfg[key] ? 'checked' : ''}/><span class="slider"></span></label></div>`;
}
function rowText(key, title, desc, cfg, type = 'text') {
  const val = cfg[key] == null ? '' : cfg[key];
  return `<div class="row"><div class="label"><div class="t">${title}</div><div class="d">${desc}</div></div>
    <input type="${type}" data-key="${key}" value="${escapeHtml(String(val))}"/></div>`;
}
function rowList(key, title, desc, cfg) {
  return rowText(key, title, desc + ' (comma-separated)', { [key]: (cfg[key] || []).join(', ') });
}

async function loadSettings() {
  const cfg = await jarvis.config.get();
  const diag = await jarvis.diag.server();
  const body = $('#settingsBody');
  body.innerHTML = `
    <div class="group">
      <h3>AI Provider</h3>
      <div class="row"><div class="label"><div class="t">Provider</div><div class="d">Local Ollama keeps everything on-device.</div></div>
        <select data-key="llmProvider">
          <option value="local"${cfg.llmProvider === 'local' ? ' selected' : ''}>Local (Ollama)</option>
          <option value="anthropic"${cfg.llmProvider === 'anthropic' ? ' selected' : ''}>Anthropic (cloud)</option>
          <option value="openai"${cfg.llmProvider === 'openai' ? ' selected' : ''}>OpenAI (cloud)</option>
        </select></div>
      ${rowText('llmModel', 'Local model', 'Ollama model name', cfg)}
      ${rowText('anthropicKey', 'Anthropic API key', 'Only used if provider is Anthropic', cfg, 'password')}
      ${rowText('openaiKey', 'OpenAI API key', 'Only used if provider is OpenAI', cfg, 'password')}
    </div>

    <div class="group">
      <h3>Capture (off by default)</h3>
      ${rowToggle('screenshotLearning', 'Screenshot learning', 'Capture only on meaningful screen changes, store structured text', cfg)}
      ${rowToggle('clipboardHistory', 'Clipboard history', 'Remember copied text', cfg)}
      ${rowToggle('browserHistory', 'Browser history', 'Remember pages sent by the extension', cfg)}
    </div>

    <div class="group">
      <h3>Background</h3>
      ${rowToggle('autoStart', 'Start with Windows', 'Launch hidden at login', cfg)}
      ${rowToggle('closeToTray', 'Keep running in tray', 'Closing the window keeps JARVIS alive', cfg)}
      ${rowToggle('notifications', 'Notifications', 'Show desktop notifications', cfg)}
    </div>

    <div class="group">
      <h3>Privacy</h3>
      ${rowToggle('excludePrivateWindows', 'Ignore private/incognito windows', 'Never store anything from private browsing', cfg)}
      ${rowList('excludedApps', 'Excluded apps', 'Apps to never capture', cfg)}
      ${rowList('excludedFolders', 'Excluded folders', 'Folder paths to never read', cfg)}
      ${rowList('excludedDomains', 'Excluded domains', 'Websites to never store', cfg)}
    </div>

    <div class="group">
      <h3>Browser extension</h3>
      <div class="row"><div class="label"><div class="t">Bridge address</div><div class="d">Paste these into the extension's options.</div></div>
        <input type="text" readonly value="http://127.0.0.1:${diag.port}"/></div>
      <div class="row"><div class="label"><div class="t">Pairing token</div><div class="d">Per-install secret. Keep private.</div></div>
        <input type="text" readonly value="${escapeHtml(diag.token)}"/></div>
    </div>

    <div class="group">
      <h3>Projects (#tags)</h3>
      <div class="row"><div class="label"><div class="t">Project labels</div><div class="d">New captures get tagged with the active project; Ask is scoped to it.</div></div>
        <div id="tagManage" class="tagmanage"></div></div>
    </div>

    <div class="group">
      <h3>Memory housekeeping</h3>
      ${rowText('memoryRetentionDays', 'Auto-delete after (days)', '0 = keep forever. Corrections & pinned items are always kept', cfg, 'number')}
      <div class="row"><div class="label"><div class="t">Clean up now</div><div class="d">Apply the rule immediately</div></div>
        <button id="cleanNowBtn" class="ghost">Clean now</button></div>
    </div>

    <div class="group">
      <h3>Errors &amp; alerts</h3>
      ${rowToggle('errorAlerts', 'Detect on-screen errors', 'Alert when an error appears and suggest a past fix', cfg)}
    </div>

    <div class="group">
      <h3>Quick open</h3>
      <div class="row"><div class="label"><div class="t">Triple-Ctrl</div><div class="d">Tap Ctrl 3× (while JARVIS is focused) to jump to Ask</div></div>
        <label class="switch"><input type="checkbox" data-key="tripleCtrlOpen" ${cfg.tripleCtrlOpen ? 'checked' : ''}/><span class="slider"></span></label></div>
      ${rowText('globalHotkey', 'Global shortcut', 'Works anywhere, e.g. Control+Shift+Space (leave blank to disable)', cfg)}
    </div>

    <div class="group">
      <h3>Data</h3>
      <div class="row danger"><div class="label"><div class="t">Delete all memories</div><div class="d">Permanently erase everything JARVIS has stored. Cannot be undone.</div></div>
        <button id="wipeBtn">Delete everything</button></div>
    </div>`;

  // wire toggles
  $$('#settingsBody input[type="checkbox"]').forEach((el) =>
    el.addEventListener('change', () => jarvis.config.patch({ [el.dataset.key]: el.checked }).then(refreshLlmStatus))
  );
  $$('#settingsBody input[type="text"], #settingsBody input[type="password"], #settingsBody input[type="number"], #settingsBody select').forEach((el) => {
    if (el.readOnly) return;
    el.addEventListener('change', () => {
      let val = el.value;
      if (['excludedApps', 'excludedFolders', 'excludedDomains'].includes(el.dataset.key)) {
        val = el.value.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (el.type === 'number') {
        val = Math.max(0, parseInt(el.value, 10) || 0);
      }
      jarvis.config.patch({ [el.dataset.key]: val }).then(refreshLlmStatus);
    });
  });
  $('#cleanNowBtn').addEventListener('click', async () => {
    const r = await jarvis.memory.cleanupNow();
    toast(r.removed ? `Removed ${r.removed} old item(s).` : 'Nothing to remove.');
  });
  renderTagManage(cfg);
  $('#wipeBtn').addEventListener('click', async () => {
    if (!confirm('Delete ALL stored memories permanently?')) return;
    await jarvis.privacy.wipe();
    toast('All memories deleted.');
    loadMemory();
  });
}

function renderTagManage(cfg) {
  const box = $('#tagManage');
  if (!box) return;
  const tags = cfg.tags || [];
  box.innerHTML = '';
  tags.forEach((t) => {
    const pill = document.createElement('span');
    pill.className = 'tagchip';
    pill.innerHTML = `${escapeHtml(t)} <button title="Remove" data-t="${escapeHtml(t)}">×</button>`;
    pill.querySelector('button').addEventListener('click', async () => {
      const next = tags.filter((x) => x !== t);
      const patch = { tags: next };
      if (cfg.activeTag === t) patch.activeTag = '';
      await jarvis.config.patch(patch);
      const fresh = await jarvis.config.get();
      renderTagManage(fresh);
      loadTagBar();
    });
    box.appendChild(pill);
  });
  const add = document.createElement('button');
  add.className = 'ghost';
  add.textContent = '＋ Add project';
  add.addEventListener('click', async () => {
    const name = (prompt('New project label:') || '').trim();
    if (!name) return;
    const next = [...new Set([...tags, name])];
    await jarvis.config.patch({ tags: next });
    const fresh = await jarvis.config.get();
    renderTagManage(fresh);
    loadTagBar();
  });
  box.appendChild(add);
}

// ---------- LLM status ----------
async function refreshLlmStatus() {
  try {
    const h = await jarvis.diag.llm();
    const el = $('#llmStatus');
    el.classList.toggle('ok', h.ok);
    el.classList.toggle('bad', !h.ok);
    $('#llmStatusText').textContent = `${h.provider}${h.ok ? ' · ready' : ' · unreachable'}`;
  } catch (_) {}
}

// ---------- Background events ----------
function showAlert(html, isError) {
  const bar = $('#alertBar');
  if (!bar) return;
  bar.className = 'alertbar' + (isError ? ' error' : '');
  bar.innerHTML = `<div class="alert-text">${html}</div><button class="alert-x">×</button>`;
  bar.querySelector('.alert-x').addEventListener('click', () => bar.classList.add('hidden'));
  clearTimeout(showAlert._t);
  showAlert._t = setTimeout(() => bar.classList.add('hidden'), 12000);
}

jarvis.onEvent((p) => {
  if (p.type === 'captured') toast(`Remembered: ${p.title || p.kind}`);
  if (p.type === 'screenshot-learned') toast(`Learned: ${p.task || p.app || 'screen change'}`);
  if (p.type === 'cleanup') toast(`Cleaned up ${p.removed} old item(s).`);
  if (p.type === 'quick-open') {
    goToView('chat');
    setTimeout(() => chatInput.focus(), 60);
  }
  if (p.type === 'error-detected') {
    const errs = (p.errors || []).join('; ');
    const sug = p.suggestion ? `<br><span class="alert-sug">Suggestion: ${escapeHtml(String(p.suggestion).slice(0, 160))}</span>` : '';
    showAlert(`<b>Error detected${p.app ? ' in ' + escapeHtml(p.app) : ''}:</b> ${escapeHtml(errs.slice(0, 160))}${sug}`, true);
  }
});

loadTagBar();
refreshLlmStatus();
setInterval(refreshLlmStatus, 30000);
