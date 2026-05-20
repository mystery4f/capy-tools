/**
 * pi-efforts config loading.
 *
 * Reads ~/.pi/effort_levels.json. The file contains an array of entries that
 * describe which custom effort/thinking-level options to expose for which
 * provider+model combinations.
 *
 * Each entry has shape:
 *   {
 *     "provider": "openai-codex",
 *     "model":    "gpt-5.5",
 *     "efforts":  ["max"],
 *     "mode":     "add"        // or "replace"
 *   }
 *
 *   - mode "add":      the listed `efforts` are appended to pi's built-in
 *                      thinking levels for that model. Unknown labels (e.g.
 *                      "max") become extra selectable options.
 *   - mode "replace":  the model's full effort-level list is replaced by
 *                      `efforts`. Pi's standard levels are hidden unless they
 *                      appear in the list.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type EffortMode = "add" | "replace";

export interface EffortLevelEntry {
  provider: string;
  model: string;
  efforts: string[];
  mode: EffortMode;
}

export interface EffortConfig {
  entries: EffortLevelEntry[];
  /** Source path the entries were loaded from. */
  source: string;
  /** Last error encountered while loading, if any. */
  error?: string;
}

/** Pi's built-in ThinkingLevel enum values. Used to tell standard from custom levels. */
export const STANDARD_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
const STANDARD_LEVEL_SET = new Set<string>(STANDARD_LEVELS);

export function isStandardLevel(level: string | undefined | null): boolean {
  if (typeof level !== "string") return false;
  return STANDARD_LEVEL_SET.has(level);
}

/** Path to the per-user effort levels config: ~/.pi/effort_levels.json */
export function getEffortConfigPath(): string {
  return join(homedir(), ".pi", "effort_levels.json");
}

/**
 * Parse a raw JSON value into an EffortConfig. Returns an empty config with an
 * error message when the input is malformed.
 */
export function parseEffortConfig(raw: unknown, source: string): EffortConfig {
  if (raw === undefined || raw === null) {
    return { entries: [], source };
  }
  if (!Array.isArray(raw)) {
    return {
      entries: [],
      source,
      error: `effort_levels.json must be a JSON array (got ${typeof raw}).`,
    };
  }

  const entries: EffortLevelEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.provider !== "string" || !rec.provider) continue;
    if (typeof rec.model !== "string" || !rec.model) continue;
    if (!Array.isArray(rec.efforts)) continue;
    const efforts = (rec.efforts as unknown[])
      .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
      .map((e) => e.trim());
    if (efforts.length === 0) continue;
    const mode: EffortMode = rec.mode === "replace" ? "replace" : "add";
    entries.push({
      provider: rec.provider,
      model: rec.model,
      efforts,
      mode,
    });
  }

  return { entries, source };
}

/** Read and parse ~/.pi/effort_levels.json. Always returns a config (never throws). */
export function loadEffortConfig(): EffortConfig {
  const path = getEffortConfigPath();
  if (!existsSync(path)) {
    return { entries: [], source: path };
  }
  try {
    const raw = readFileSync(path, "utf8");
    const trimmed = raw.trim();
    if (trimmed === "") return { entries: [], source: path };
    const parsed = JSON.parse(trimmed) as unknown;
    return parseEffortConfig(parsed, path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      entries: [],
      source: path,
      error: `Failed to read ${path}: ${message}`,
    };
  }
}

export function findEntryFor(
  config: EffortConfig,
  provider: string | undefined,
  modelId: string | undefined,
): EffortLevelEntry | undefined {
  if (!provider || !modelId) return undefined;
  return config.entries.find((e) => e.provider === provider && e.model === modelId);
}

/**
 * Merge a model's existing thinking-level list with the configured efforts
 * according to the entry's mode. Preserves order: built-in levels first, then
 * custom additions (in `add` mode) or just the custom list (in `replace` mode).
 *
 * Always de-duplicates while preserving first-seen order.
 */
export function computeEffortLevels(
  baseLevels: readonly string[],
  entry: EffortLevelEntry | undefined,
): string[] {
  if (!entry) return [...baseLevels];
  if (entry.mode === "replace") return dedupePreserveOrder(entry.efforts);
  return dedupePreserveOrder([...baseLevels, ...entry.efforts]);
}

function dedupePreserveOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
