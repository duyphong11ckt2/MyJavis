# Get the .exe

The Windows installer must be produced on Windows (Electron native modules + NSIS are platform-specific). You have two ways to get it.

---

## Option 1 — GitHub Actions (no Windows machine needed) ✅ recommended

1. Create a new GitHub repository and push this project to it:
   ```bash
   git init
   git add .
   git commit -m "JARVIS AI Desktop v1.0.0"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Tag a release and push the tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. Open the repo's **Actions** tab. The "Build Windows Installer" workflow runs on a clean `windows-latest` machine, installs deps, rebuilds native modules, and builds the installer.
4. Get the `.exe`:
   - From the workflow run's **Artifacts** (`jarvis-windows`), **or**
   - From the repo's **Releases** page — on a `v*` tag the workflow attaches the installer automatically.

You can also trigger it manually: **Actions → Build Windows Installer → Run workflow** (no tag needed; the `.exe` then appears under Artifacts).

The lockfile (`package-lock.json`) is included so `npm ci` produces a reproducible build.

---

## Option 2 — Build locally on Windows

Requirements: Windows 10/11 x64, Node.js 18+, and the Visual Studio "Desktop development with C++" workload (for native modules).

```bash
npm install
npm run dist:win
```

Output in `release/`:
- `JARVIS AI Desktop-Setup-1.0.0.exe` (installer)
- `JARVIS AI Desktop-1.0.0-portable.exe` (portable)

---

## Why it can't be built in a Linux sandbox

`electron-builder` must download the Electron Windows runtime and the NSIS toolchain, and `better-sqlite3` must fetch a win32 prebuild. All of these are served from GitHub release-asset hosts. In a restricted sandbox those hosts are blocked, and a Windows `.exe` cannot be cross-built and verified from Linux anyway. A real Windows environment (your machine or the CI runner above) solves both.
