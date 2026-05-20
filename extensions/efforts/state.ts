/**
 * pi-efforts per-model state persistence.
 *
 * Remembers the most recently picked effort label for each
 * provider+model so pi resumes the same choice after a restart.
 * Stored at ~/.pi/effort_levels.state.json as:
 *
 *   {
 *     "version": 1,
 *     "selections": {
 *       "openai-codex/gpt-5.5": "max",
 *       "anthropic/claude-opus-4-6": "max"
 *     }
 *   }
 *
 * This file is plugin-owned. pi itself still tracks its own
 * default thinking level in ~/.pi/agent/settings.json — that value
 * is clamped by pi at startup, so we use this file to re-apply the
 * user's intended custom level after the session is built.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const STATE_VERSION = 1;

interface StateFile {
  version: number;
  selections: Record<string, string>;
}

export function getStatePath(): string {
  return join(homedir(), ".pi", "effort_levels.state.json");
}

function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

function readStateFile(): StateFile {
  const path = getStatePath();
  if (!existsSync(path)) {
    return { version: STATE_VERSION, selections: {} };
  }
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (raw === "") return { version: STATE_VERSION, selections: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { version: STATE_VERSION, selections: {} };
    }
    const obj = parsed as Record<string, unknown>;
    const selections = (obj.selections && typeof obj.selections === "object")
      ? (obj.selections as Record<string, unknown>)
      : {};
    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(selections)) {
      if (typeof v === "string" && v.length > 0) sanitized[k] = v;
    }
    return { version: STATE_VERSION, selections: sanitized };
  } catch {
    return { version: STATE_VERSION, selections: {} };
  }
}

function writeStateFile(state: StateFile): void {
  const path = getStatePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf8");
  } catch {
    // Best-effort: state persistence failures must not break pi.
  }
}

export function getSavedEffort(
  provider: string | undefined,
  model: string | undefined,
): string | undefined {
  if (!provider || !model) return undefined;
  const state = readStateFile();
  return state.selections[modelKey(provider, model)];
}

export function setSavedEffort(
  provider: string | undefined,
  model: string | undefined,
  effort: string,
): void {
  if (!provider || !model) return;
  const state = readStateFile();
  state.selections[modelKey(provider, model)] = effort;
  writeStateFile(state);
}

export function clearSavedEffort(
  provider: string | undefined,
  model: string | undefined,
): void {
  if (!provider || !model) return;
  const state = readStateFile();
  const key = modelKey(provider, model);
  if (!(key in state.selections)) return;
  delete state.selections[key];
  writeStateFile(state);
}
