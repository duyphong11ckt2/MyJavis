# What's New — v1.1 features

Five additions, all off/empty by default so nothing changes until you use them.

## 1. Capture exclusion by app/window
Screen capture now checks the **foreground app and window title** (via a quick
PowerShell call on Windows) before storing anything. Add app names or site
keywords under **Settings → Privacy → Excluded apps / domains**; matching windows
are skipped. Password managers and sign-in pages are excluded by default.

## 3. Auto-delete old memories
**Settings → Memory housekeeping → Auto-delete after (days).** Set a number of
days; older captures are removed automatically (runs at launch and daily).
`0` keeps everything. **Corrections and pinned items are never auto-deleted.**
A **Clean now** button applies it on demand.

## 4. Timeline
New **Timeline** tab: a newest-first list of what you worked on, grouped by day,
with times. Detected errors are flagged in red.

## 6. Project tags
A **Project** bar on the Ask screen. Pick or create a label (e.g. "OPUS").
While a project is active, new captures are tagged with it and **Ask is scoped to
that project**. Manage labels under **Settings → Projects**. Corrections always
apply regardless of project.

## 7. On-screen error detection
When screen text contains an error, JARVIS raises a desktop alert and an in-app
banner, looks for a **past fix** in your memory/corrections, and keeps the error
entry (it's pinned so cleanup won't remove it). Toggle under
**Settings → Errors & alerts**.

## Quick open
- **Triple-Ctrl:** tap Ctrl three times (while the JARVIS window is focused) to
  jump straight to the Ask box.
- **Global shortcut:** default `Control+Shift+Space` works anywhere to show/hide
  the window. Change or clear it under **Settings → Quick open**.

> Note on the global gesture: detecting a triple-Ctrl tap *system-wide* (when the
> app is in the background) needs a system keyboard hook that isn't bundled in
> this build, so the global trigger is a key combo. Triple-Ctrl works while the
> window is focused.
