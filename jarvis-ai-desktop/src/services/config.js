'use strict';
/**
 * Persistent configuration. Stored as JSON in userData via electron-store.
 * Everything defaults to local-only and the most private setting.
 */
const Store = require('electron-store');
const crypto = require('crypto');

const DEFAULTS = {
  // --- Providers -----------------------------------------------------------
  // 'local'  -> Ollama on localhost (no data leaves the machine)
  // 'anthropic' / 'openai' -> only used if the user opts in and adds a key
  llmProvider: 'local',
  llmModel: 'llama3.1',
  ollamaUrl: 'http://127.0.0.1:11434',
  anthropicKey: '',
  anthropicModel: 'claude-sonnet-4-6',
  openaiKey: '',
  openaiModel: 'gpt-4o-mini',

  // Embeddings run fully locally by default (transformers.js / MiniLM).
  embeddingProvider: 'local',
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',

  // --- Capture features (all OFF until the user turns them on) --------------
  screenshotLearning: false,
  screenshotChangeThreshold: 0.12, // 0..1 perceptual-diff ratio to count as "meaningful"
  screenshotMinIntervalMs: 4000, // never sample faster than this even on change
  clipboardHistory: false,
  browserHistory: false,

  // --- Background behaviour ------------------------------------------------
  autoStart: false,
  closeToTray: true,
  notifications: true,

  // --- Local bridge for the browser extension ------------------------------
  serverPort: 38217,
  serverToken: '', // generated on first run

  // --- Privacy exclusions --------------------------------------------------
  excludedApps: ['1password', 'bitwarden', 'keepass', 'lastpass'],
  excludedFolders: [],
  excludedDomains: ['accounts.google.com', 'login.microsoftonline.com'],
  excludePrivateWindows: true,

  // --- Retrieval -----------------------------------------------------------
  retrievalTopK: 6,
  retrievalMinScore: 0.25,

  // --- Memory housekeeping (#3) -------------------------------------------
  // Delete non-pinned, non-correction memories older than this many days.
  // 0 disables automatic cleanup. Corrections and pinned notes are kept.
  memoryRetentionDays: 0,

  // --- Project tags (#6) ---------------------------------------------------
  // User-defined project labels and the one currently in focus. When a tag is
  // active, new captures are labelled with it and Ask is scoped to it.
  tags: [],
  activeTag: '',

  // --- Error detection (#7) ------------------------------------------------
  // When screen text contains errors, raise a desktop alert and tag the memory.
  errorAlerts: true,

  // --- Quick-open hotkey ---------------------------------------------------
  // Global accelerator (works anywhere). Triple-Ctrl works while focused.
  globalHotkey: 'Control+Shift+Space',
  tripleCtrlOpen: true,

  firstRunComplete: false
};

let store = null;

function get() {
  if (!store) {
    store = new Store({ name: 'jarvis-config', defaults: DEFAULTS });
    if (!store.get('serverToken')) {
      store.set('serverToken', crypto.randomBytes(24).toString('hex'));
    }
  }
  return store;
}

function all() {
  return { ...DEFAULTS, ...get().store };
}

function read(key) {
  return get().get(key);
}

function write(key, value) {
  get().set(key, value);
  return value;
}

function patch(obj) {
  const s = get();
  for (const [k, v] of Object.entries(obj)) s.set(k, v);
  return all();
}

module.exports = { get, all, read, write, patch, DEFAULTS };
