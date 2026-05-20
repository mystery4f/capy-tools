import { describe, expect, test } from "bun:test";

import codexFastExtension, { setCodexFastEnabled } from "../extensions/codex-fast.ts";

function createCodexFastHarness() {
  const handlers = new Map<string, Function[]>();
  const commands = new Map<string, { handler: Function; description?: string }>();
  const flags = new Map<string, unknown>();
  const statuses: Array<{ key: string; text: string | undefined }> = [];
  const notifications: Array<{ message: string; type?: string }> = [];

  const ctx = {
    cwd: process.cwd(),
    hasUI: true,
    model: { provider: "openai", id: "gpt-test" },
    ui: {
      setStatus(key: string, text: string | undefined) {
        statuses.push({ key, text });
      },
      notify(message: string, type?: string) {
        notifications.push({ message, type });
      },
      theme: {
        fg(_name: string, text: string) {
          return text;
        },
      },
    },
  };

  const api = {
    registerFlag(name: string, options: unknown) {
      flags.set(name, options);
    },
    getFlag() {
      return false;
    },
    registerCommand(name: string, options: { handler: Function; description?: string }) {
      commands.set(name, options);
    },
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  };

  codexFastExtension(api as any);

  return {
    ctx,
    handlers,
    commands,
    flags,
    statuses,
    notifications,
    async emit(event: string, payload: any = {}) {
      let result;
      for (const handler of handlers.get(event) ?? []) result = await handler(payload, ctx);
      return result;
    },
  };
}

describe("codex-fast", () => {
  test("registers the command and startup flag", () => {
    const host = createCodexFastHarness();
    expect(host.flags.has("fast")).toBe(true);
    expect(host.commands.has("codex-fast")).toBe(true);
  });

  test("adds service_tier=priority for enabled OpenAI requests", async () => {
    const host = createCodexFastHarness();
    await host.emit("model_select", { model: { provider: "openai", id: "gpt-test" } });
    setCodexFastEnabled(true, host.ctx as any, { persist: false, notify: false });

    const result = await host.emit("before_provider_request", { payload: { model: "gpt-test" } });
    expect(result).toEqual({ model: "gpt-test", service_tier: "priority" });
  });

  test("does not override existing service_tier or unsupported providers", async () => {
    const host = createCodexFastHarness();
    await host.emit("model_select", { model: { provider: "openai", id: "gpt-test" } });
    setCodexFastEnabled(true, host.ctx as any, { persist: false, notify: false });
    expect(await host.emit("before_provider_request", { payload: { service_tier: "default" } })).toBeUndefined();

    await host.emit("model_select", { model: { provider: "anthropic", id: "claude" } });
    expect(await host.emit("before_provider_request", { payload: { model: "claude" } })).toBeUndefined();
  });
});
