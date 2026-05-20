/**
 * Folder-based command history for pi.
 *
 * Forked from `pi-command-history` v0.1.2 (MIT). The behavior is intentionally
 * preserved: user inputs are persisted per working directory and recalled with
 * ctrl+up / ctrl+down across sessions.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HISTORY_DIR = join(homedir(), ".pi", "folder-history");
const MAX_HISTORY = 500;

function getHistoryFile(cwd: string): string {
  const name = cwd.replace(/\//g, "-");
  return join(HISTORY_DIR, `${name}.jsonl`);
}

function loadHistory(cwd: string): string[] {
  const file = getHistoryFile(cwd);
  if (!existsSync(file)) return [];

  try {
    const entries: string[] = [];
    const lines = readFileSync(file, "utf8").split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { cwd?: unknown; text?: unknown };
        if (entry.cwd === cwd && typeof entry.text === "string" && entry.text) {
          entries.push(entry.text);
        }
      } catch {
        // Ignore malformed historical rows; a single bad JSONL line should not
        // disable command recall for the whole folder.
      }
    }

    const seen = new Map<string, number>();
    entries.forEach((text, index) => seen.set(text, index));
    const unique = [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([text]) => text);

    return unique.slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

function appendHistory(cwd: string, text: string): void {
  mkdirSync(HISTORY_DIR, { recursive: true });
  const entry = JSON.stringify({ cwd, text, ts: Date.now() });
  appendFileSync(getHistoryFile(cwd), `${entry}\n`, "utf8");
}

export default function commandHistoryExtension(pi: ExtensionAPI): void {
  let history: string[] = [];
  let historyIndex = -1;
  let savedEditorText = "";
  let currentCwd = "";

  pi.on("session_start", (_event, ctx) => {
    currentCwd = ctx.cwd;
    history = loadHistory(currentCwd);
    historyIndex = -1;
    savedEditorText = "";

    ctx.ui.setStatus(
      "folder-history",
      history.length > 0 ? `${history.length} cmds (ctrl+up/down)` : undefined,
    );
  });

  pi.on("input", (event: { text?: string }) => {
    const text = event.text?.trim();
    if (!text || !currentCwd) return;

    appendHistory(currentCwd, text);

    const existingIndex = history.indexOf(text);
    if (existingIndex !== -1) history.splice(existingIndex, 1);
    history.push(text);
    if (history.length > MAX_HISTORY) history.shift();

    historyIndex = -1;
    savedEditorText = "";

    return { action: "continue" as const };
  });

  pi.registerShortcut("ctrl+up", {
    description: "Previous command from folder history",
    handler: (ctx) => {
      if (history.length === 0) return;

      if (historyIndex === -1) {
        savedEditorText = ctx.ui.getEditorText();
      }

      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) return;

      historyIndex = nextIndex;
      ctx.ui.setEditorText(history[history.length - 1 - historyIndex]);
    },
  });

  pi.registerShortcut("ctrl+down", {
    description: "Next command from folder history",
    handler: (ctx) => {
      if (historyIndex <= -1) return;

      historyIndex--;

      if (historyIndex === -1) {
        ctx.ui.setEditorText(savedEditorText);
      } else {
        ctx.ui.setEditorText(history[history.length - 1 - historyIndex]);
      }
    },
  });
}
