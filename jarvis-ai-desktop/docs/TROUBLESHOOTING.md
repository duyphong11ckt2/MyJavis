# Troubleshooting

Common problems and how to fix them. If you're stuck, the log file is your best friend:

```
%APPDATA%\JARVIS AI Desktop\logs\jarvis.log
```

(Or `userData/logs/jarvis.log` — the app prints its userData path on startup.)

---

## Install & launch

**The app won't start / closes immediately.**
- Check `jarvis.log` for a fatal error. On a corrupt database the app automatically backs up the bad file and recreates the schema; if that fails, delete the data folder (see "Reset everything") and relaunch.
- Make sure you're on 64-bit Windows 10/11.

**SmartScreen warns about an unknown publisher.**
- Expected for an unsigned build. Choose **More info → Run anyway**, or sign the installer with a code-signing certificate for distribution.

**Closing the window doesn't quit the app.**
- That's intended: JARVIS stays in the **system tray**. Right-click the tray icon → **Quit** to exit fully, or turn off "Close to tray" in Settings.

---

## Build (from source)

**`better-sqlite3` / native module error at runtime** (ABI mismatch).
```bash
npm run rebuild        # rebuilds better-sqlite3 for the current Electron
```
If it persists, delete `node_modules` and reinstall:
```bash
rmdir /s /q node_modules
npm install
```

**`gyp` / C++ build errors during `npm install`.**
- Install the Visual Studio "Desktop development with C++" workload, reopen the terminal, and run `npm install` again.

**`npm run dist:win` fails or produces nothing.**
- Installers must be built **on Windows**. Cross-building from Linux/macOS won't yield a working `.exe`.
- No Windows machine? Push a `v*` tag and let the bundled GitHub Actions workflow build it on `windows-latest`, then download the artifact.

---

## AI provider

**Status dot is red/amber; answers say the model is unreachable.**
- **Local (Ollama):** confirm Ollama is installed and running, and that you've pulled a model (`ollama pull llama3.1`). Default URL is `http://127.0.0.1:11434`.
- **Anthropic / OpenAI:** check the API key in Settings and your internet connection.
- Even when the LLM is down, chat still returns **raw memory matches** — retrieval works offline.

**Answers ignore something I uploaded.**
- Confirm the item shows in **Memory** (it must finish embedding to be searchable).
- If you switched **embedding provider** after uploading, re-upload key documents — old vectors were created with the previous model.

---

## Memory & retrieval

**Search feels off or returns too few results.**
- Try more specific wording; retrieval blends vector similarity with keyword (FTS5) matching.
- Approve a 👎 **correction** with the right answer — corrections are pinned and boosted, so they surface first next time.

**I want to start clean.**
- Settings → Privacy → **Delete all memories** wipes the store (irreversible).

---

## Screenshot learning

**Nothing is being captured.**
- It's **off by default** — enable it in Settings (or from the tray menu).
- Captures happen only on a **meaningful screen change**; small changes are intentionally ignored. Lower the change threshold in config if needed.

**A specific app/site shouldn't be captured.**
- Add it to **Excluded applications** / **Excluded websites** in Settings.
- Note: full per-app screenshot gating depends on the active-window provider hook (see [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)). Domain exclusion via the extension works today.

---

## Browser extension

**Popup says "not connected."**
- Open JARVIS → Settings and copy the **exact** pairing address and token into the extension popup, then **Save & test**.
- The desktop app must be running (the loopback server starts with it).

**Send page / screenshot does nothing.**
- The active site may be on the excluded list, or it's a private/incognito window (excluded by default).
- Reload the page after installing the extension so the content script is active.

---

## Reset everything

To wipe all app data and start fresh, quit JARVIS and delete its data folder:

```
%APPDATA%\JARVIS AI Desktop\
```

This removes the database, config, logs, and cached models. The next launch recreates a clean, privacy-first setup.

---

## Where to look

- **Logs:** `%APPDATA%\JARVIS AI Desktop\logs\jarvis.log`
- **Config/DB:** `%APPDATA%\JARVIS AI Desktop\`
- **Architecture & internals:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Extending the app:** [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)
