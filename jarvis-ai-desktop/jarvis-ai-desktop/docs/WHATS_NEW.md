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

## Efficient capture (data/battery saver)
Capture is now activity-driven instead of a fixed timer:
- **Pauses when you're away** — if there's no keyboard/mouse for a while
  (Settings → Capture → "Pause when idle"), it stops capturing entirely.
- **Captures on window/app change** — switching from Excel to Jira to Chrome
  triggers a capture; sitting on one screen does not keep re-capturing.
- **Same-screen re-check** — a configurable minimum gap before the same window
  is captured again (Settings → "Same-screen re-check").
This cuts CPU, battery, and cloud-AI calls a lot while keeping the useful record.

## Smarter assistant (v1.2)
- **Recurring-error alerts** — when the same error appears repeatedly (threshold
  configurable in Settings → Errors & alerts), the alert escalates and shows the
  last known fix from your memory/corrections.
- **Playbooks** — Automate → "Build playbook from recent activity" turns your
  recent steps into a reusable SOP, saved (pinned) into Memory.
- **Link context** — Ask → "Link context" gathers everything connected to a
  vessel/ticket/person and explains how the pieces relate, with sources.
- **Draft in my style** — Ask → "Draft in my style" writes a message using your
  writing samples (Settings → My writing samples) plus your past phrasing.
- **OPUS specialist** — Settings → OPUS specialist & voice. Injects terminal
  terminology (BAPLIE, stowage, vessel…) and answers in English by default
  (language is configurable).

## User profile & role templates
- **Profile & role** (top of Settings): set your name, role, and a short description
  of what you do. The assistant reads this on every answer to personalize replies.
- **Role templates** — one-click presets (QA/Tester, Developer, Operations, PM) that
  fill the profile and apply sensible defaults. Handy for rolling out to a team.
- **Analyze & suggest setup** — the assistant reads your description and proposes
  settings (OPUS mode, error alerts, tone, language) with reasons. Review the
  checkboxes and apply only what you want.
- **Answer tone** — Concise / Balanced / Detailed.
