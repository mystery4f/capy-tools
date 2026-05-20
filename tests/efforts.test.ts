import { describe, expect, test } from "bun:test";

import { computeEffortLevels, findEntryFor, parseEffortConfig } from "../extensions/efforts/config.ts";
import { rewritePayload } from "../extensions/efforts/payload.ts";

describe("efforts config", () => {
  test("parses entries and computes add/replace effort lists", () => {
    const config = parseEffortConfig(
      [
        { provider: "openai-codex", model: "gpt-5.5", efforts: ["max", "high"], mode: "add" },
        { provider: "anthropic", model: "claude", efforts: ["low", "max"], mode: "replace" },
      ],
      "test-config",
    );

    const openai = findEntryFor(config, "openai-codex", "gpt-5.5");
    expect(computeEffortLevels(["off", "low", "high"], openai)).toEqual(["off", "low", "high", "max"]);

    const anthropic = findEntryFor(config, "anthropic", "claude");
    expect(computeEffortLevels(["off", "low", "high"], anthropic)).toEqual(["low", "max"]);
  });

  test("reports malformed top-level config", () => {
    const config = parseEffortConfig({ provider: "openai" }, "bad-config");
    expect(config.entries).toEqual([]);
    expect(config.error).toContain("must be a JSON array");
  });
});

describe("efforts payload rewrite", () => {
  test("rewrites common reasoning effort fields", () => {
    const payload = {
      reasoning: { effort: "low" },
      reasoning_effort: "low",
      output_config: { effort: "low" },
      thinking: { effort: "low" },
    };

    const result = rewritePayload(payload, "max");
    expect(result.rewrote).toBe(true);
    expect(result.payload).toEqual({
      reasoning: { effort: "max", summary: "auto" },
      reasoning_effort: "max",
      output_config: { effort: "max" },
      thinking: { effort: "max" },
      include: ["reasoning.encrypted_content"],
    });
  });

  test("maps numeric Anthropic effort labels to budget_tokens", () => {
    const payload = { thinking: { type: "enabled", budget_tokens: 1024 } };
    const result = rewritePayload(payload, "32768");
    expect(result.rewrote).toBe(true);
    expect(result.payload).toEqual({ thinking: { type: "enabled", budget_tokens: 32768 } });
  });
});
