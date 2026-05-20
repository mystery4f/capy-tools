/**
 * pi-efforts — custom effort/thinking-level options for pi.

 *
 * Bundled into Capy Tools from pi-efforts v0.1.0 (MIT). The runtime
 * behavior and ~/.pi/effort_levels.json compatibility are intentionally
 * preserved; see docs/bundled-sources.md for source provenance.
 *
 * What this extension does
 * ------------------------
 *
 * pi's built-in thinking-level selector caps out at "xhigh" because that's
 * the highest value in pi-ai's ThinkingLevel enum. Many provider APIs accept
 * higher values such as "max", or arbitrary effort labels per model. This
 * extension lets you declare extra (or replacement) effort labels per
 * provider+model in ~/.pi/effort_levels.json and:
 *
 *   1. Makes those labels appear in pi's native thinking-level selector
 *      (Ctrl+T) and the footer.
 *   2. Persists the user's choice across sessions in
 *      ~/.pi/effort_levels.state.json.
 *   3. Re-stamps the outgoing provider payload so the custom label is the
 *      value actually sent to the API (working around pi-ai's internal
 *      clamp).
 *
 * Config format (~/.pi/effort_levels.json)
 * ---------------------------------------
 *
 *   [
 *     {
 *       "provider": "openai-codex",
 *       "model":    "gpt-5.5",
 *       "efforts":  ["max"],
 *       "mode":     "add"
 *     },
 *     {
 *       "provider": "anthropic",
 *       "model":    "claude-opus-4-6",
 *       "efforts":  ["low", "medium", "high", "max"],
 *       "mode":     "replace"
 *     }
 *   ]
 *
 *   - mode "add":     listed efforts are appended to pi's built-in levels.
 *   - mode "replace": only the listed efforts are shown for that model.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  findEntryFor,
  isStandardLevel,
  loadEffortConfig,
  type EffortConfig,
} from "./config.ts";
import { applyAgentSessionPatch } from "./patch.ts";
import { rewritePayload } from "./payload.ts";
import {
  clearSavedEffort,
  getSavedEffort,
  setSavedEffort,
} from "./state.ts";

const STATUS_KEY = "pi-efforts";
const LOG_PREFIX = "[pi-efforts]";

let currentConfig: EffortConfig = { entries: [], source: "" };

function refreshConfig(): EffortConfig {
  currentConfig = loadEffortConfig();
  if (currentConfig.error) {
    console.warn(`${LOG_PREFIX} ${currentConfig.error}`);
  }
  return currentConfig;
}

function logRefresh(): void {
  if (currentConfig.entries.length === 0) {
    if (currentConfig.error) return; // already warned
    return; // file empty or absent — silent
  }
}

/**
 * True when the current model is matched by an effort_levels.json entry AND
 * the supplied label is in that entry's effort list. Standard levels also
 * pass: pi handles them natively, no custom behavior required.
 */
function isCustomEffortForModel(
  config: EffortConfig,
  provider: string | undefined,
  modelId: string | undefined,
  level: string,
): boolean {
  if (isStandardLevel(level)) return false;
  const entry = findEntryFor(config, provider, modelId);
  if (!entry) return false;
  return entry.efforts.includes(level);
}

/**
 * Update the footer status badge to reflect the active effort.
 * Cleared when the value matches a standard pi level (pi already shows
 * those in its own footer slot).
 */
function updateStatus(pi: ExtensionAPI, ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  const model = ctx.model;
  const level = pi.getThinkingLevel();
  if (!model || isStandardLevel(level)) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }
  if (!isCustomEffortForModel(currentConfig, model.provider, model.id, level)) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }
  ctx.ui.setStatus(STATUS_KEY, `effort: ${level}`);
}

/**
 * After pi finishes constructing a session, restore the user's most recent
 * custom effort for the active model if it's still configured. Pi clamps the
 * level to a built-in enum value during session construction, so we have to
 * re-apply it here through pi.setThinkingLevel() (whose prototype we've
 * patched to accept extra labels).
 */
function restoreEffortForModel(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const model = ctx.model;
  if (!model) return;
  const entry = findEntryFor(currentConfig, model.provider, model.id);
  if (!entry) return;
  const saved = getSavedEffort(model.provider, model.id);
  if (!saved) return;
  if (!entry.efforts.includes(saved)) {
    // The stored effort is no longer offered by config; drop it.
    clearSavedEffort(model.provider, model.id);
    return;
  }
  if (saved === pi.getThinkingLevel()) return;
  try {
    pi.setThinkingLevel(saved as never);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`${LOG_PREFIX} failed to restore effort "${saved}" for ${model.provider}/${model.id}: ${message}`);
  }
}

export default function piEffortsExtension(pi: ExtensionAPI): void {
  refreshConfig();
  logRefresh();
  applyAgentSessionPatch(() => currentConfig);

  pi.on("session_start", async (_evt, ctx) => {
    refreshConfig();
    restoreEffortForModel(pi, ctx);
    updateStatus(pi, ctx);
  });

  pi.on("model_select", async (_evt, ctx) => {
    restoreEffortForModel(pi, ctx);
    updateStatus(pi, ctx);
  });

  pi.on("thinking_level_select", async (evt, ctx) => {
    const model = ctx.model;
    if (!model) return;
    const entry = findEntryFor(currentConfig, model.provider, model.id);
    const level = evt.level as unknown as string;
    if (!entry) {
      // Model has no custom config — clear any stale saved override.
      clearSavedEffort(model.provider, model.id);
      updateStatus(pi, ctx);
      return;
    }
    if (entry.efforts.includes(level) && !isStandardLevel(level)) {
      setSavedEffort(model.provider, model.id, level);
    } else if (isStandardLevel(level)) {
      // User went back to a built-in level; drop the override.
      clearSavedEffort(model.provider, model.id);
    }
    updateStatus(pi, ctx);
  });

  pi.on("before_provider_request", async (evt, ctx) => {
    const model = ctx.model;
    if (!model) return;
    const level = pi.getThinkingLevel() as unknown as string;
    if (!isCustomEffortForModel(currentConfig, model.provider, model.id, level)) {
      return;
    }
    const { payload, rewrote } = rewritePayload(evt.payload, level);
    if (!rewrote) return;
    return payload;
  });

  pi.registerCommand("efforts-reload", {
    description: "Reload ~/.pi/effort_levels.json (pi-efforts).",
    async handler(_args, ctx) {
      const cfg = refreshConfig();
      const lines = [
        `pi-efforts reloaded ${cfg.entries.length} entr${cfg.entries.length === 1 ? "y" : "ies"} from ${cfg.source}.`,
      ];
      if (cfg.error) lines.push(`Warning: ${cfg.error}`);
      for (const entry of cfg.entries) {
        lines.push(`  ${entry.provider}/${entry.model}  [${entry.mode}]  ${entry.efforts.join(", ")}`);
      }
      ctx.ui.notify(lines.join("\n"), cfg.error ? "warning" : "info");
      updateStatus(pi, ctx);
    },
  });
}
