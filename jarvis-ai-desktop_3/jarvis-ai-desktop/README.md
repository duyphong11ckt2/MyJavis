# JARVIS AI Desktop

A local-first personal AI assistant for Windows. It learns from your work **only with explicit permission**, builds a long-term searchable memory using Retrieval-Augmented Generation (RAG), answers questions about what you've done, and drafts automation scripts for repetitive workflows.

Everything runs **locally by default**. No data leaves your machine unless you deliberately enable a cloud AI provider.

---

## Highlights

- **Electron desktop app** — modern dark UI, system tray, optional auto-start, settings, native notifications, runs in the background when the window is closed.
- **Local long-term memory (RAG)** — documents, conversations, approved corrections, OCR text, workflow history, and notes are embedded locally and retrieved by hybrid vector + keyword search. The LLM is never retrained.
- **Screenshot learning** — captures only on *meaningful* screen change (perceptual hashing), runs OCR + a vision/extraction pass, and stores **structured knowledge**, not the images.
- **Browser extension (Chrome/Edge, MV3)** — send the active URL, page title, selected text, DOM text, and on-demand screenshots to the desktop app over an authenticated loopback connection.
- **Memory-first chat** — every question searches your memory before the LLM is consulted, and answers cite their sources.
- **Feedback & corrections** — 👍 / 👎 on every answer; a 👎 captures the correct answer, reason, and category, which becomes pinned long-term memory.
- **Automation** — detects repeated workflows and generates Python / PowerShell / Batch / Playwright scripts. Scripts are **never executed automatically**; you always confirm and save.
- **Privacy by design** — local-only defaults, per-app / folder / website exclusions, private-window exclusion, and a one-click "delete all memories."

## Default AI stack (all local, all swappable)

| Concern    | Local default                                  | Optional cloud |
|------------|------------------------------------------------|----------------|
| LLM        | [Ollama](https://ollama.com) (`llama3.1`)      | Anthropic (`claude-sonnet-4-6`), OpenAI |
| Embeddings | `@xenova/transformers` (`all-MiniLM-L6-v2`)    | OpenAI embeddings |
| OCR        | `tesseract.js`                                 | — |
| Storage    | SQLite (`better-sqlite3`) + FTS5               | — |

## Quick start (build the Windows installer)

You need **Windows + Node.js 18+** to produce the `.exe` (Electron installers must be built on the target OS).

```bash
npm install            # installs deps and rebuilds native modules for Electron
npm run dist:win       # produces release/JARVIS AI Desktop-Setup-1.0.0.exe + portable
```

The installer and a portable build appear in `release/`. Prefer not to build locally? Push a `v*` tag and the included GitHub Actions workflow builds it on a clean `windows-latest` runner.

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for full details, and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) if anything misbehaves.

## Documentation

- [User Guide](docs/USER_GUIDE.md) — day-to-day usage
- [Installation Guide](docs/INSTALLATION.md) — build, install, first run
- [Architecture](docs/ARCHITECTURE.md) — how the pieces fit together
- [Developer Guide](docs/DEVELOPER_GUIDE.md) — codebase, native modules, extension hooks
- [Troubleshooting](docs/TROUBLESHOOTING.md) — common problems and fixes

## License

Provided as-is for the project owner. Add a license of your choice before distribution.
