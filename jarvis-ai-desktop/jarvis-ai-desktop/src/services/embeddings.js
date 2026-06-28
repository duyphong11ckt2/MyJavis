'use strict';
/**
 * Embeddings. Default runs fully on-device with @xenova/transformers
 * (all-MiniLM-L6-v2, 384 dims) so nothing leaves the machine. If the user
 * opts into a cloud provider for embeddings we fall back to its API.
 *
 * The model is lazy-loaded on first use; the first call downloads ~25 MB of
 * weights into the userData cache, then is offline forever after.
 */
const config = require('./config');
const { log } = require('./logger');

let pipe = null;
let loading = null;

async function getLocalPipeline() {
  if (pipe) return pipe;
  if (loading) return loading;
  loading = (async () => {
    const { pipeline, env } = await import('@xenova/transformers');
    // Keep weights inside the app's data dir.
    try {
      const { app } = require('electron');
      const path = require('path');
      env.cacheDir = path.join(app.getPath('userData'), 'models');
    } catch (_) {
      /* non-electron context */
    }
    const model = config.read('embeddingModel') || 'Xenova/all-MiniLM-L6-v2';
    log.info('Loading local embedding model:', model);
    pipe = await pipeline('feature-extraction', model);
    return pipe;
  })();
  return loading;
}

async function embedLocal(text) {
  const p = await getLocalPipeline();
  const out = await p(text, { pooling: 'mean', normalize: true });
  return Float32Array.from(out.data);
}

async function embedRemote(text) {
  // Only OpenAI exposes a simple embeddings endpoint among the supported
  // providers; used solely if the user explicitly selected it.
  const key = config.read('openaiKey');
  if (!key) throw new Error('No OpenAI key configured for remote embeddings.');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text })
  });
  if (!res.ok) throw new Error(`Embedding API ${res.status}`);
  const json = await res.json();
  return Float32Array.from(json.data[0].embedding);
}

async function embed(text) {
  const t = (text || '').slice(0, 8000);
  if (config.read('embeddingProvider') === 'openai') {
    try {
      return await embedRemote(t);
    } catch (e) {
      log.warn('Remote embedding failed, falling back to local:', e.message);
    }
  }
  return embedLocal(t);
}

function toBlob(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

function fromBlob(buf) {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function cosine(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

module.exports = { embed, toBlob, fromBlob, cosine };
