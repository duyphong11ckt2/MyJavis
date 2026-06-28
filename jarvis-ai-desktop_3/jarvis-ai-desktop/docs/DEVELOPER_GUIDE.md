# Developer Guide

How to work on JARVIS AI Desktop: set up, run, understand the code, and extend it.

---

## Prerequisites

- Node.js 18+ and npm.
- For native modules and Windows installers: a Windows machine with the Visual Studio "Desktop development with C++" workload (see [INSTALLATION.md](INSTALLATION.md) Part B).
- Optional but recommended: [Ollama](https://ollama.com) for a local LLM during development.

## Setup & run

```bash
npm install        # installs deps; postinstall rebuilds native modules for Electron
npm start          # launch the app
npm run dev        # launch with JARVIS_ENV=development
```

If `better-sqlite3` throws an ABI error at startup, rebuild it for Electron:

```bash
npm run rebuild    # electron-rebuild -f -w better-sqlite3
```

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full tree and data flow. In short:

- `src/main/` — main process (lifecycle, windows, tray, IPC, autostart).
- `src/preload/preload.js` — the **only** bridge between renderer and main; add new IPC surface here.
- `src/renderer/` — UI; no Node access by design.
- `src/services/` — all reusable logic, UI-free and individually testable.
- `extension/` — MV3 browser extension.
- `scripts/init-db.js` — standalone DB initializer.

## How a chat request flows

1. Renderer calls `window.jarvis.chat.ask(text)` (exposed via preload).
2. `ipc.js` → `chat:ask` creates/loads a conversation, stores the user message.
3. `memory.answer()` retrieves (vector + FTS5), builds the numbered context, calls `llm.chat()`.
4. The assistant message + sources are stored; the Q/A pair is ingested as `kind:'conversation'` memory.
5. Renderer renders the answer with **source chips** and 👍/👎 controls.

## Adding a new IPC channel

1. Implement logic in a service under `src/services/`.
2. Register `ipcMain.handle('namespace:action', ...)` in `src/main/ipc.js`.
3. Expose it in `src/preload/preload.js` under the `jarvis` object.
4. Call it from `src/renderer/app.js`.

Keep services free of Electron imports where possible so they stay unit-testable.

## Configuration

`config.js` wraps `electron-store` ("jarvis-config") with privacy-first defaults: all capture off, local providers, `serverPort: 38217`, an auto-generated `serverToken`, and pre-populated exclusion lists (password managers, sign-in domains). Use `config.read/write/patch`. Never log the `serverToken` or API keys.

## Providers

- **LLM** (`llm.js`): `ollamaChat` (default, `llama3.1`), `anthropicChat` (`claude-sonnet-4-6`), `openaiChat` (`gpt-4o-mini`). All normalize to `chat({system, messages}) → {text}`; `health()` powers the UI status dot.
- **Embeddings** (`embeddings.js`): local `all-MiniLM-L6-v2` (384-dim) via transformers.js, cached under `userData/models`, with an OpenAI remote option. Helpers: `toBlob/fromBlob/cosine`.

To add a provider, implement the same shape and branch on the config value.

## Implementation hooks (intentionally left open)

These are clearly-bounded extension points, not bugs:

- **Active-window provider** (`screenshots.js`): capture context (`ctx`) currently default-allows. Implement a Windows active-window/app/title provider (e.g. via a small native helper or PowerShell) and feed `{app, title, url}` into the privacy gate so per-app/per-site screenshot exclusion is enforced before OCR.
- **Clipboard / browser-history capture**: toggles exist in config/UI; wire the collectors behind the same `privacy.allow()` gate.
- **Vision model for screenshots**: the extraction step uses OCR text + LLM today. Swapping in a true multimodal vision call is a drop-in change in the screenshot extraction path.

## Native modules & packaging notes

- `better-sqlite3`, `sharp`, and `@xenova/transformers` include native/binary assets. `electron-builder` is configured with `asarUnpack` so they load correctly from a packaged app.
- `postinstall` runs `electron-builder install-app-deps` to rebuild natives against Electron's ABI.
- Windows targets: NSIS installer + portable, x64. See `build` in `package.json`.
- **Installers must be built on Windows** (or via the `windows-latest` GitHub Actions workflow). You cannot cross-build a working Windows `.exe` from Linux/macOS because the native modules and NSIS stage are platform-specific.

## Testing checklist (manual, on Windows)

- Fresh install → app launches, DB + config created, all capture off.
- Upload a `.txt` → appears in Memory → ask a question → answer cites it.
- 👎 a wrong answer → submit correction → it appears in Corrections and is preferred next time.
- Toggle screenshot learning → cause a screen change → a `kind:'ocr'` structured record appears (no image stored).
- Pair the extension → Send page / screenshot → content shows in Memory.
- Close window → app stays in tray → quit from tray.
- Settings → Delete all memories → store is emptied.

## Coding conventions

- Services: small, pure, no UI imports.
- All user-facing **UI text and labels are in English**.
- Never expose secrets to the renderer; keep them in main/config only.
- Log via `logger.js` (rotating file under `userData/logs`), never `console.log` in production paths.
