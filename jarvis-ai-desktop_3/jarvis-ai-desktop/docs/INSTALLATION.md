# Installation Guide

There are two audiences for this document:

- **End users** who just want to install and run the app → [Part A](#part-a--install-and-run).
- **Builders** who need to produce the `.exe` from source → [Part B](#part-b--build-the-installer-from-source).

---

## Part A — Install and run

### Requirements
- Windows 10 or 11 (64-bit).
- ~500 MB free disk space (more if you download local models).
- **No** manual Python, Node.js, or Docker install is required — the Electron runtime is bundled in the installer.

### Install with the installer (.exe)
1. Double-click `JARVIS AI Desktop-Setup-1.0.0.exe`.
2. Choose the install location if prompted (per-user install, no admin needed).
3. Finish. JARVIS launches automatically.

On first launch it creates its database and a privacy-first config; every capture feature is **off** until you enable it.

### Or use the portable build
`JARVIS AI Desktop-1.0.0-portable.exe` runs without installing. It still stores data in your user profile.

### Enabling local AI (recommended)
JARVIS works memory-only, but for written answers install a local LLM:
1. Install [Ollama](https://ollama.com).
2. `ollama pull llama3.1`
3. In JARVIS → Settings → AI Provider, select **Local (Ollama)**.

The header status dot turns green when Ollama is reachable. To use cloud instead, pick Anthropic or OpenAI and paste a key.

### Install the browser extension
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select the `extension/` folder (it ships next to the app under `resources/extension`, or use the copy from the source zip).
4. In JARVIS → Settings, copy the **pairing address** and **token**.
5. Open the extension popup, paste both, click **Save & test** — it should report Connected.

---

## Part B — Build the installer from source

Electron installers must be built **on the target OS**. To produce the Windows `.exe`, build on **Windows** (or use the CI workflow below).

### Prerequisites (Windows build machine)
- Windows 10/11 64-bit.
- [Node.js 18+](https://nodejs.org) (includes npm).
- Build tools for native modules (`better-sqlite3` compiles natively). Install **one** of:
  - "Desktop development with C++" workload from Visual Studio Build Tools, **or**
  - run `npm install --global windows-build-tools` (older setups).

### Build steps
```bash
# from the project root
npm install          # installs deps; postinstall rebuilds native modules for Electron
npm run dist:win     # builds NSIS installer + portable, x64
```

Outputs land in `release/`:
- `JARVIS AI Desktop-Setup-1.0.0.exe` — NSIS installer
- `JARVIS AI Desktop-1.0.0-portable.exe` — portable
- supporting blockmap/yml files

### Useful scripts
| Command            | Purpose                                                        |
|--------------------|----------------------------------------------------------------|
| `npm start`        | Run the app in dev (no packaging).                             |
| `npm run init-db`  | Initialize/verify the SQLite schema standalone.               |
| `npm run rebuild`  | Rebuild `better-sqlite3` against the current Electron ABI.     |
| `npm run pack`     | Build an unpacked app dir (fast smoke test, no installer).    |
| `npm run dist:win` | Build the Windows installer + portable.                        |

### Build on CI (no local Windows needed)
The repo includes `.github/workflows/build-windows.yml`. It runs on `windows-latest` and:
1. `npm ci`
2. `electron-builder install-app-deps` (native rebuild)
3. `npm run dist:win`
4. Uploads `release/*.exe` as workflow artifacts.

Trigger it by pushing a tag like `v1.0.0`, or run it manually via **workflow_dispatch** in the Actions tab. Download the finished installer from the run's artifacts.

### Common build issues
- **`better-sqlite3` errors at runtime** → run `npm run rebuild` (ABI mismatch between Node and Electron).
- **Missing C++ toolchain** → install the Visual Studio C++ workload, then `npm install` again.
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more.
