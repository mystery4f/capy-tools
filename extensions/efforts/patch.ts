/**
 * Monkey-patches pi's AgentSession.prototype.getAvailableThinkingLevels so
 * that the built-in thinking-level selector (Ctrl+T) and footer surface our
 * custom effort labels — not just the hard-coded enum off/minimal/low/medium/
 * high/xhigh.
 *
 * Why this works:
 *   - AgentSession.setThinkingLevel(level) accepts any string when
 *     `availableLevels.includes(level)`; it skips internal clamping in that
 *     case. By extending the available-levels list with our custom labels,
 *     calling setThinkingLevel("max") simply stores "max" in agent state.
 *   - The footer just renders state.thinkingLevel as a string, so "max" shows
 *     up naturally.
 *
 * What this DOES NOT fix:
 *   - The provider-side clamp in pi-ai (clampThinkingLevel) still degrades
 *     unknown levels before the HTTP payload is built. That mismatch is
 *     repaired downstream by the `before_provider_request` hook in index.ts,
 *     which rewrites the outgoing payload's reasoning field to the picked
 *     custom label.
 */

import { AgentSession } from "@earendil-works/pi-coding-agent";
import { computeEffortLevels, findEntryFor, type EffortConfig } from "./config.ts";

const PATCH_MARKER = "__piEffortsPatched__";

type Patchable = typeof AgentSession.prototype & {
  [PATCH_MARKER]?: boolean;
  model?: { provider?: string; id?: string } | undefined;
};

/**
 * Apply the prototype patch. Safe to call multiple times — only the first
 * call mutates the prototype. The getter `getConfig` is consulted on every
 * invocation so config edits picked up via reload immediately take effect.
 */
export function applyAgentSessionPatch(getConfig: () => EffortConfig): void {
  const proto = AgentSession.prototype as Patchable;
  if (proto[PATCH_MARKER]) return;

  const original: (this: Patchable) => string[] | readonly string[] =
    (proto as any).getAvailableThinkingLevels;
  if (typeof original !== "function") {
    // Defensive: pi changed its API. Bail out without patching.
    return;
  }

  (proto as any).getAvailableThinkingLevels = function patchedGetAvailableThinkingLevels(
    this: Patchable,
  ): string[] {
    const base = Array.from(original.call(this) ?? []);
    const model = this.model;
    if (!model || !model.provider || !model.id) return base;
    const config = getConfig();
    const entry = findEntryFor(config, model.provider, model.id);
    return computeEffortLevels(base, entry);
  };

  proto[PATCH_MARKER] = true;
}
