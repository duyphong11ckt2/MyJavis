'use strict';
/**
 * LLM abstraction. Default provider is local Ollama (nothing leaves the
 * machine). Cloud providers are only reachable if the user opted in AND
 * supplied a key in Settings.
 *
 * All providers expose the same contract:
 *   chat({ system, messages }) -> { text }
 */
const config = require('./config');
const { log } = require('./logger');

async function ollamaChat({ system, messages }) {
  const url = (config.read('ollamaUrl') || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = config.read('llmModel') || 'llama3.1';
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages]
    })
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { text: json.message?.content?.trim() || '' };
}

async function anthropicChat({ system, messages }) {
  const key = config.read('anthropicKey');
  if (!key) throw new Error('Anthropic key not configured.');
  const model = config.read('anthropicModel') || 'claude-sonnet-4-6';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      ...(system ? { system } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    })
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = (json.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { text };
}

async function openaiChat({ system, messages }) {
  const key = config.read('openaiKey');
  if (!key) throw new Error('OpenAI key not configured.');
  const model = config.read('openaiModel') || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages]
    })
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { text: json.choices?.[0]?.message?.content?.trim() || '' };
}

async function chat(payload) {
  const provider = config.read('llmProvider') || 'local';
  try {
    if (provider === 'anthropic') return await anthropicChat(payload);
    if (provider === 'openai') return await openaiChat(payload);
    return await ollamaChat(payload);
  } catch (e) {
    log.error(`LLM provider "${provider}" failed:`, e.message);
    throw e;
  }
}

async function health() {
  const provider = config.read('llmProvider') || 'local';
  try {
    if (provider === 'local') {
      const url = (config.read('ollamaUrl') || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const r = await fetch(`${url}/api/tags`);
      return { provider, ok: r.ok };
    }
    if (provider === 'anthropic') return { provider, ok: !!config.read('anthropicKey') };
    if (provider === 'openai') return { provider, ok: !!config.read('openaiKey') };
  } catch (e) {
    return { provider, ok: false, error: e.message };
  }
  return { provider, ok: false };
}

module.exports = { chat, health };
