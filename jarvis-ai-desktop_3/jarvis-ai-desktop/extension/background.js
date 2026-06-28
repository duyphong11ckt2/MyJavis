'use strict';
/* JARVIS Bridge — service worker.
   Talks ONLY to the local desktop app at 127.0.0.1 using the per-install token.
   Nothing is sent anywhere else. Capture is user-initiated (popup buttons or
   context menu) — there is no silent background scraping. */

const DEFAULTS = { url: 'http://127.0.0.1:38217', token: '', autoOnSelect: false };

async function cfg() {
  const s = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

async function post(path, body) {
  const c = await cfg();
  if (!c.token) throw new Error('Not paired. Open the popup and paste the token from Settings.');
  const res = await fetch(c.url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.token}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}`);
  return res.json();
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getPageData(tab) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      url: location.href,
      title: document.title,
      selection: String(window.getSelection() || ''),
      text: document.body ? document.body.innerText.slice(0, 60000) : '',
      incognito: false
    })
  });
  return { ...result, incognito: tab.incognito };
}

async function sendPage() {
  const tab = await activeTab();
  const data = await getPageData(tab);
  return post('/capture/page', data);
}

async function sendScreenshot() {
  const tab = await activeTab();
  const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
  return post('/capture/screenshot', {
    url: tab.url,
    title: tab.title,
    dataUrl,
    incognito: tab.incognito
  });
}

// Context menu: "Send selection to JARVIS"
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'jarvis-send-selection',
    title: 'Send selection to JARVIS',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'jarvis-send-page',
    title: 'Send this page to JARVIS',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'jarvis-send-selection') {
      await post('/capture/page', {
        url: tab.url,
        title: tab.title,
        selection: info.selectionText || '',
        text: '',
        incognito: tab.incognito
      });
    } else if (info.menuItemId === 'jarvis-send-page') {
      await sendPage();
    }
  } catch (e) {
    console.warn('JARVIS context action failed:', e.message);
  }
});

// Messages from the popup.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'sendPage') sendResponse(await sendPage());
      else if (msg.type === 'sendScreenshot') sendResponse(await sendScreenshot());
      else if (msg.type === 'ask') sendResponse(await post('/ask', { question: msg.question }));
      else if (msg.type === 'ping') {
        const c = await cfg();
        const r = await fetch(c.url + '/ping');
        sendResponse({ ok: r.ok });
      } else sendResponse({ error: 'unknown' });
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();
  return true; // async
});
