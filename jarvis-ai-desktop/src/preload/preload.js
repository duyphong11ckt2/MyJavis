'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('jarvis', {
  config: {
    get: () => invoke('config:get'),
    patch: (patch) => invoke('config:patch', patch)
  },
  chat: {
    ask: (question, conversationId) => invoke('chat:ask', { question, conversationId }),
    history: (id) => invoke('chat:history', id),
    conversations: () => invoke('chat:conversations')
  },
  feedback: {
    up: (messageId) => invoke('feedback:up', messageId),
    correct: (payload) => invoke('feedback:correct', payload),
    list: () => invoke('corrections:list')
  },
  memory: {
    note: (note) => invoke('memory:note', note),
    uploadDocs: () => invoke('memory:uploadDocs'),
    recent: (kind) => invoke('memory:recent', kind),
    stats: () => invoke('memory:stats'),
    cleanupNow: () => invoke('memory:cleanupNow')
  },
  timeline: { get: (limit) => invoke('timeline:get', limit) },
  errors: { recent: () => invoke('errors:recent') },
  automation: {
    detect: () => invoke('automation:detect'),
    generate: (p) => invoke('automation:generate', p),
    list: () => invoke('automation:list'),
    setStatus: (id, status) => invoke('automation:status', { id, status }),
    save: (p) => invoke('automation:save', p)
  },
  privacy: { wipe: () => invoke('privacy:wipe') },
  diag: { llm: () => invoke('diag:llm'), server: () => invoke('diag:server') },
  onEvent: (cb) => ipcRenderer.on('jarvis:event', (_e, payload) => cb(payload))
});
