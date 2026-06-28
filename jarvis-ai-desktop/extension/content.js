'use strict';
/* Minimal content script. The heavy lifting (reading DOM text / selection) is
   done on demand via chrome.scripting from the service worker, so this stays
   tiny and does nothing in the background. Kept for future in-page UI hooks. */
chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg && msg.type === 'getSelection') {
    send({ selection: String(window.getSelection() || '') });
  }
  return true;
});
