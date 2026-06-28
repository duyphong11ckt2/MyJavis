# Architecture

JARVIS AI Desktop is an Electron application with three cooperating parts:

1. **Main process** — app lifecycle, windows, tray, IPC, and a small loopback HTTP server.
2. **Renderer** — the dark-mode UI (HTML/CSS/JS) talking to the main process through a locked-down preload bridge.
3. **Browser extension** — an MV3 Chrome/Edge extension that pushes page context to the loopback server on demand.

Everything is **local-first**. The only outbound network calls happen if you opt into a cloud LLM/embedding provider.

---

## High-level diagram

```
                ┌──────────────────────────────────────────────┐
                │                Electron App                   │
                │                                               │
  ┌──────────┐  │  ┌───────────┐  preload   ┌───────────────┐   │
  │ Renderer │◄─┼─►│   IPC     │◄──bridge──►│  Main process │   │
  │  (UI)    │  │  │ handlers  │            │  lifecycle    │   │
  └──────────┘  │  └─────┬─────┘            │  windows/tray │   │
                │        │                  └──────┬────────┘   │
                │        ▼                         │            │
                │  ┌──────────────── services ─────┴─────────┐  │
                │  │ memory(RAG) embeddings llm ocr           │  │
                │  │ screenshots automation corrections       │  │
                │  │ privacy config db logger server          │  │
                │  └───────┬───────────────────────┬─────────┘  │
                │          ▼                        ▼            │
                │   ┌────────────┐          ┌──────────────┐     │
                │   │  SQLite    │          │ loopback HTTP │    │
                │   │ + FTS5     │          │ 127.0.0.1     │    │
                │   │ + vectors  │          │ token-auth    │    │
                │   └────────────┘          └──────┬───────┘     │
                └──────────────────────────────────┼────────────┘
                                                   ▲
                                          ┌────────┴────────┐
                                          │ Browser ext.    │
                                          │ (MV3, on-demand)│
                                          └─────────────────┘

   Optional outbound (only if enabled):  Ollama (local) / Anthropic / OpenAI
```

---

## Process & directory layout

```
src/
  main/        Main-process code (Node + Electron)
    main.js        entry: single-instance lock, startup checks, wiring
    lifecycle.js   startup checks + fatal-error handling + DB recovery
    windows.js     main BrowserWindow, close-to-tray behaviour
    tray.js        system tray menu and toggles
    ipc.js         all ipcMain.handle channels
    autostart.js   Windows login-item integration
  preload/
    preload.js     contextBridge: exposes a minimal `window.jarvis` API
  renderer/      UI (no Node access)
    index.html, styles.css, app.js
  services/      Pure logic, reusable, no UI
    db.js, config.js, logger.js
    embeddings.js, llm.js, memory.js
    ocr.js, screenshots.js
    automation.js, corrections.js
    privacy.js, server.js
extension/       MV3 Chrome/Edge extension
scripts/         init-db.js standalone initializer
resources/       icons
.github/         Windows build workflow
```

---

## Security model

- **contextIsolation on, nodeIntegration off.** The renderer never touches Node directly; it only sees the small surface exposed in `preload.js` (`window.jarvis`). A strict CSP is set in `index.html`.
- **Loopback-only server.** The bridge binds to `127.0.0.1:38217` (configurable). Every request except `/ping` requires a per-install **bearer token**; CORS is restricted to extension origins.
- **Privacy gate.** `privacy.js` is consulted before anything is captured or ingested — it enforces excluded apps, folders, domains, and private windows.

---

## Data model (SQLite)

| Table           | Purpose                                                                 |
|-----------------|-------------------------------------------------------------------------|
| `memories`      | Core store. One row per chunk: `text`, `embedding` (Float32 BLOB), `dim`, `kind` (`document`/`conversation`/`ocr`/`correction`/`note`), `pinned`, metadata. |
| `memories_fts`  | FTS5 virtual table mirroring `memories.text` for keyword search (kept in sync by triggers). |
| `conversations` / `messages` | Chat history.                                              |
| `corrections`   | Approved corrections (also ingested into `memories` as pinned).         |
| `activity`      | Workflow/event log used for automation detection.                       |
| `automations`   | Generated scripts and their status.                                     |

Vectors are stored inline as BLOBs; similarity is computed in-process with cosine. This keeps the app fully portable (no native vector extension to compile or ship).

---

## The RAG pipeline (`memory.js`)

1. **Ingest** — text is split into ~1100-char chunks (150 overlap), each embedded and stored with its kind/metadata.
2. **Retrieve** — a query is embedded and scored two ways:
   - **Vector**: cosine similarity over candidate embeddings.
   - **Keyword**: FTS5 match on the same text.
   The two result sets are merged. Corrections get a `+0.15` boost and pinned items `+0.08`, so trusted knowledge surfaces first.
3. **Answer** — the top-K snippets are assembled into a numbered context block and sent to the LLM with a system prompt instructing it to answer **only** from the provided memory and to cite snippet numbers. Those numbers map back to **source chips** in the UI.
4. **Graceful degradation** — if no LLM is reachable, `answer()` returns the raw retrieved snippets so the feature is still useful offline.

Crucially, **the LLM is never retrained.** All "learning" is new rows in the memory store; corrections simply add pinned, boosted rows.

---

## Screenshot learning (`screenshots.js`)

A polling loop captures the screen, reduces it to a 16×16 grayscale **perceptual hash** (via `sharp`), and compares the Hamming distance to the previous frame. Only when the change ratio exceeds the configured threshold does it:

1. OCR the frame (`ocr.js`, tesseract.js).
2. Ask the LLM to extract a structured record (`application`, `current_task`, `errors`, `buttons`, `commands`, `workflow_step`).
3. Store that JSON as a `kind = 'ocr'` memory — **the image is discarded.**

> Active-window app/URL gating is a documented hook: the capture context (`ctx`) currently default-allows, with a platform-specific active-window provider left for implementation. See [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md).

---

## Browser extension bridge

The extension (MV3 service worker) reads the active tab only when the user clicks **Send page / Send screenshot** or uses a context menu. It POSTs to the loopback server with the bearer token. The server re-checks privacy rules before storing anything. No background scraping occurs.
