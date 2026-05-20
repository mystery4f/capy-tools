import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import commandHistoryExtension from "../extensions/command-history.ts";
import { withTempDir } from "./extension-host.ts";

function historyFile(cwd: string): string {
  return join(homedir(), ".pi", "folder-history", `${cwd.replace(/\//g, "-")}.jsonl`);
}

const cleanupFiles = new Set<string>();

afterEach(() => {
  for (const file of cleanupFiles) rmSync(file, { force: true });
  cleanupFiles.clear();
});

function createCommandHistoryHarness() {
  const handlers = new Map<string, Function[]>();
  const shortcuts = new Map<string, { handler: Function; description?: string }>();
  const statuses: Array<{ key: string; text: string | undefined }> = [];
  let editorText = "";

  const ui = {
    setStatus(key: string, text: string | undefined) {
      statuses.push({ key, text });
    },
    getEditorText() {
      return editorText;
    },
    setEditorText(text: string) {
      editorText = text;
    },
  };

  const api = {
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerShortcut(shortcut: string, options: { handler: Function; description?: string }) {
      shortcuts.set(shortcut, options);
    },
  };

  commandHistoryExtension(api as any);

  return {
    statuses,
    get editorText() {
      return editorText;
    },
    set editorText(value: string) {
      editorText = value;
    },
    async emit(event: string, payload: any, cwd: string) {
      for (const handler of handlers.get(event) ?? []) {
        await handler(payload, { cwd, ui });
      }
    },
    runShortcut(shortcut: string, cwd: string) {
      shortcuts.get(shortcut)?.handler({ cwd, ui });
    },
    shortcuts,
  };
}

describe("command-history", () => {
  test("persists input per folder and recalls it with shortcuts", async () => {
    await withTempDir(async (cwd) => {
      const file = historyFile(cwd);
      cleanupFiles.add(file);
      rmSync(file, { force: true });

      const host = createCommandHistoryHarness();
      await host.emit("session_start", {}, cwd);
      expect(host.statuses.at(-1)).toEqual({ key: "folder-history", text: undefined });

      await host.emit("input", { text: "first command" }, cwd);
      await host.emit("input", { text: "second command" }, cwd);
      expect(existsSync(file)).toBe(true);

      host.editorText = "draft text";
      host.runShortcut("ctrl+up", cwd);
      expect(host.editorText).toBe("second command");
      host.runShortcut("ctrl+up", cwd);
      expect(host.editorText).toBe("first command");
      host.runShortcut("ctrl+down", cwd);
      expect(host.editorText).toBe("second command");
      host.runShortcut("ctrl+down", cwd);
      expect(host.editorText).toBe("draft text");
    });
  });

  test("loads existing folder history on a new session", async () => {
    await withTempDir(async (cwd) => {
      const file = historyFile(cwd);
      cleanupFiles.add(file);
      rmSync(file, { force: true });

      const writer = createCommandHistoryHarness();
      await writer.emit("session_start", {}, cwd);
      await writer.emit("input", { text: "remember me" }, cwd);

      const reader = createCommandHistoryHarness();
      await reader.emit("session_start", {}, cwd);
      expect(reader.statuses.at(-1)).toEqual({ key: "folder-history", text: "1 cmds (ctrl+up/down)" });
      reader.runShortcut("ctrl+up", cwd);
      expect(reader.editorText).toBe("remember me");
    });
  });
});
