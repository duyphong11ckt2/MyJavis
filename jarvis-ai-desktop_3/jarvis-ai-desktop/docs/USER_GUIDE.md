# User Guide

This guide covers everyday use of JARVIS AI Desktop. For installation, see [INSTALLATION.md](INSTALLATION.md).

---

## 1. First launch

On first run the app:

1. Creates its data folder and local database under your Windows user profile.
2. Generates a private configuration with **all capture features turned off** and a random pairing token for the browser extension.
3. Opens to the **Ask** screen.

Nothing is recorded until you explicitly enable a capture feature or upload something.

A status dot in the app header shows whether your chosen AI provider is reachable:

- **Green** — provider reachable (e.g. Ollama running, or a valid cloud key).
- **Amber/Red** — not reachable. Chat still retrieves from memory and shows raw matches, but cannot compose a written answer until the provider is fixed (see Settings → AI Provider).

---

## 2. The five screens

The left sidebar has five sections.

### Ask
Your chat with the assistant. Type a question and press Enter.

- Every question **searches your memory first**, then asks the LLM to answer using only what was found.
- Answers show **source chips** — the memory items the answer was built from. Click a chip to see the snippet.
- Try things like:
  - "What was I working on yesterday?"
  - "Find the SQL query I copied last week."
  - "How did I solve the Kubernetes issue?"
  - "Summarize today's work."

### Memory
Browse and add to what JARVIS knows.

- **Filter** by kind: documents, conversations, OCR, corrections, notes.
- **Upload documents** — plain-text formats (`.txt`, `.md`, `.csv`, `.json`, `.log`, `.sql`). They are chunked, embedded locally, and made searchable.
- **Add a note** — jot anything you want remembered.
- **Recent** shows the latest stored items.

### Automate
- **Detect** scans your recorded workflow history for actions repeated three or more times in the last week and suggests candidates.
- **Generate** drafts a script from a description. Pick the language (Python / PowerShell / Batch / Playwright).
- Generated scripts are shown for review and can be **saved to disk**. They are **never run for you** — you stay in control.

### Corrections
A log of every correction you've approved. Each one is stored as pinned, high-priority memory so the assistant prefers it in future answers.

### Settings
See section 4.

---

## 3. Feedback & corrections

Under every answer are 👍 and 👎.

- **👍** marks the answer as good (a small positive signal).
- **👎** opens a short form:
  - **Correct answer** — what it should have said.
  - **Reason** — why the original was wrong.
  - **Category** — a tag (e.g. "SQL", "deployment").

Once you approve it, the correction becomes long-term pinned memory and is preferred in related future answers.

---

## 4. Settings

### AI Provider
- Choose **Local (Ollama)**, **Anthropic**, or **OpenAI** for the LLM, and **Local** or **OpenAI** for embeddings.
- For local use, install [Ollama](https://ollama.com) and pull a model (e.g. `ollama pull llama3.1`).
- For cloud, paste the relevant API key. Keys are stored in your local app config only.

> Changing the **embedding** provider changes how new memories are vectorized. Existing memories keep their original vectors; re-upload key documents if you switch.

### Capture features (all off by default)
- **Screenshot learning** — when on, JARVIS watches for meaningful screen changes, OCRs them, extracts structured info (application, current task, errors, buttons, commands, workflow step), and stores that — **not the image**.
- **Notifications** — desktop toasts for key events.
- Optional **clipboard** / **browser history** capture, where available.

### Background behaviour
- **Close to tray** — closing the window keeps JARVIS running in the system tray. Quit fully from the tray menu.
- **Auto-start** — launch JARVIS (hidden) when Windows starts.

### Privacy
- **Excluded applications** — windows from these apps are never captured (password managers are pre-excluded).
- **Excluded folders** — files under these paths are never ingested.
- **Excluded websites** — pages from these domains are ignored by the extension (sign-in pages pre-excluded).
- **Exclude private/incognito windows** — on by default.
- **Delete all memories** — wipes the entire memory store. This cannot be undone.

### Browser extension pairing
Shows the local **address** and **token** the extension needs. Copy both into the extension popup to connect.

---

## 5. Browser extension

After loading the extension (see [INSTALLATION.md](INSTALLATION.md)) and pairing it:

- **Send page** — sends the current tab's URL, title, selection, and visible text.
- **Send screenshot** — captures the visible tab and sends it for OCR.
- **Ask** — ask a question from the popup.
- Right-click menus let you send the **selection** or the **whole page**.

The extension only sends data when **you** trigger it. It never scrapes silently, and excluded domains are blocked.

---

## 6. Privacy summary

- Local by default — memory, embeddings, and OCR all run on your machine.
- Cloud providers are used **only** if you enable them and provide a key.
- Capture is opt-in per feature, with app/folder/website/private-window exclusions.
- You can delete everything at any time from Settings → Privacy.
