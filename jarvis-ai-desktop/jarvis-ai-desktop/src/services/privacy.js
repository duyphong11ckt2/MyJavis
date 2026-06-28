'use strict';
/**
 * Privacy gatekeeper. Every capture path (screenshots, clipboard, browser,
 * extension) asks here before anything is stored. Defaults are conservative.
 */
const config = require('./config');

function lc(s) {
  return (s || '').toLowerCase();
}

function isAppExcluded(appName) {
  const name = lc(appName);
  if (!name) return false;
  return (config.read('excludedApps') || []).some((e) => name.includes(lc(e)));
}

function isFolderExcluded(filePath) {
  const p = lc(filePath).replace(/\\/g, '/');
  if (!p) return false;
  return (config.read('excludedFolders') || []).some((f) => p.includes(lc(f).replace(/\\/g, '/')));
}

function isDomainExcluded(url) {
  if (!url) return false;
  let host = '';
  try {
    host = lc(new URL(url).hostname);
  } catch (_) {
    host = lc(url);
  }
  return (config.read('excludedDomains') || []).some((d) => host.includes(lc(d)));
}

function isPrivateWindowAllowed() {
  return !config.read('excludePrivateWindows');
}

/**
 * Window titles often contain the app name and/or the open site/document.
 * Block if the title mentions any excluded app, domain, or folder keyword.
 */
function isTitleExcluded(title) {
  const t = lc(title);
  if (!t) return false;
  const apps = config.read('excludedApps') || [];
  const domains = config.read('excludedDomains') || [];
  if (apps.some((a) => t.includes(lc(a)))) return true;
  if (domains.some((d) => t.includes(lc(d)))) return true;
  // Common private-browsing markers.
  if (config.read('excludePrivateWindows') && /(incognito|inprivate|private browsing)/.test(t)) {
    return true;
  }
  return false;
}

/** True if this capture context is allowed to be stored. */
function allow({ app, filePath, url, incognito, title } = {}) {
  if (incognito && config.read('excludePrivateWindows')) return false;
  if (app && isAppExcluded(app)) return false;
  if (title && isTitleExcluded(title)) return false;
  if (filePath && isFolderExcluded(filePath)) return false;
  if (url && isDomainExcluded(url)) return false;
  return true;
}

module.exports = {
  allow,
  isAppExcluded,
  isFolderExcluded,
  isDomainExcluded,
  isTitleExcluded,
  isPrivateWindowAllowed
};
