'use strict';
/**
 * Initializes the JARVIS database in a chosen location. Used by the installer's
 * post-install step and for manual setup. Safe to run repeatedly (idempotent).
 *
 *   node scripts/init-db.js [targetDir]
 */
const path = require('path');
const os = require('os');

const target =
  process.argv[2] ||
  process.env.JARVIS_DATA_DIR ||
  path.join(os.homedir(), 'AppData', 'Roaming', 'jarvis-ai-desktop');

try {
  const db = require('../src/services/db');
  db.open(target);
  const stats = db.stats();
  // eslint-disable-next-line no-console
  console.log('JARVIS database ready at', target);
  // eslint-disable-next-line no-console
  console.log('Tables:', JSON.stringify(stats));
  process.exit(0);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('DB init failed:', e.message);
  process.exit(1);
}
