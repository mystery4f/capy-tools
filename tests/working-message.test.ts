import { describe, expect, test } from "bun:test";

import workingMessageExtension from "../extensions/cat-whimsical/index.ts";
import { createExtensionHost } from "./extension-host.ts";

describe("working-message", () => {
  test("turn_start mounts the Capy working-message widget without runtime errors", async () => {
    const calls: Array<{ key: string; content: unknown; options?: unknown }> = [];
    const ui = {
      setWorkingVisible(visible: boolean) {
        calls.push({ key: "visible", content: visible });
      },
      setWidget(key: string, content: unknown, options?: unknown) {
        calls.push({ key, content, options });
      },
    };
    const host = createExtensionHost({ ui });

    workingMessageExtension(host.api as any);
    await host.emit("turn_start");

    expect(calls.some((call) => call.key === "visible" && call.content === false)).toBe(true);
    expect(calls.some((call) => call.key === "capy-tools-working-message")).toBe(true);
  });
});
