'use strict';
/**
 * Active-window provider.
 *
 * Returns the foreground window's { app, title } so the privacy gate can skip
 * capturing sensitive apps/sites. Implemented with a short PowerShell call on
 * Windows (no native module, nothing to download). On macOS/Linux it returns
 * an empty object, which means "allow" — exclusion there can be added later.
 *
 * It is only called right before a meaningful frame is processed (not on every
 * poll), so the cost is small.
 */
const { log } = require('./logger');

let cache = { at: 0, value: {} };
const CACHE_MS = 1500;

const PS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class JW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int c);
}
"@
$h = [JW]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 1024
[void][JW]::GetWindowText($h, $sb, $sb.Capacity)
$procId = 0
[void][JW]::GetWindowThreadProcessId($h, [ref]$procId)
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue
$name = if ($p) { $p.ProcessName } else { "" }
Write-Output ("{0}\`t{1}" -f $name, $sb.ToString())
`.trim();

function getWindows() {
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    const child = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
      { timeout: 2500, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve({});
        const line = String(stdout).split(/\r?\n/).find((l) => l.trim().length) || '';
        const tab = line.indexOf('\t');
        const app = (tab >= 0 ? line.slice(0, tab) : line).trim();
        const title = (tab >= 0 ? line.slice(tab + 1) : '').trim();
        resolve({ app, title });
      }
    );
    child.on('error', () => resolve({}));
  });
}

/** Best-effort foreground window info. Cached briefly; never throws. */
async function current() {
  if (process.platform !== 'win32') return {};
  const now = Date.now();
  if (now - cache.at < CACHE_MS) return cache.value;
  try {
    const value = await getWindows();
    cache = { at: now, value };
    return value;
  } catch (e) {
    log.warn('Active-window lookup failed:', e.message);
    return {};
  }
}

module.exports = { current };
