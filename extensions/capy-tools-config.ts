/**
 * Shared Capy Tools settings store.
 *
 * All user-configurable extension settings live in one global file:
 * `~/.pi/agent/capy-tools.json`. Legacy standalone files are read as
 * migration sources when a section is missing from the unified config.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const CAPY_TOOLS_CONFIG_PATH = join(getAgentDir(), "capy-tools.json");
export const LEGACY_WORKING_MESSAGE_CONFIG_PATH = join(getAgentDir(), "cat-whimsical.json");
export const LEGACY_AUTO_COMPACT_CONFIG_PATH = join(getAgentDir(), "auto-compact-settings.json");
export const LEGACY_PI_SETTINGS_PATH = join(getAgentDir(), "settings.json");

export const LANGUAGE_LABELS = {
  en: "English",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
} as const;

export type Language = keyof typeof LANGUAGE_LABELS;

export type WorkingMessageSettings = {
  language: Language;
};

export type CompactionStrategy = "keep-recent" | "keep-bookends" | "summarize-all";

export type AutoCompactConfig = {
  /** Percentage of context window that triggers auto-compaction. */
  autoCompactPercent: number;
  /** Fixed token threshold, used only when autoCompactPercent is 0. */
  autoCompactTokenLimit: number;
  /** Percentage of context window to preserve as recent raw context. */
  keepRecentPercent: number;
  /** Message retention strategy applied by the emergency context hook. */
  strategy: CompactionStrategy;
};

export type CodexFastConfig = {
  /** Whether OpenAI/OpenAI Codex requests should request the priority service tier. */
  enabled: boolean;
};

export const ALL_TOOL_IDS = [
  "fetch",
  "enable-builtin-search",
  "repo-map",
  "read-block",
  "symbol-outline",
  "apply-patch",
  "terminal-session",
  "ask-user",
  "ask-question",
  "ask-questionnaire",
  "sourcegraph",
  "recap",
  "message-shape-diagnostic",
  "auto-compact",
  "codex-fast",
  "capy-tools-settings",
  "command-history",
  "efforts",
  "codex-goal",
  "rtk",
  "thinking-steps",
  "todo",
  "showsignature",
  "working-message",
] as const;

export type ToolId = (typeof ALL_TOOL_IDS)[number];

export type ToolsConfig = Record<ToolId, boolean>;

export type CapyToolsSettings = {
  workingMessage: WorkingMessageSettings;
  autoCompact: AutoCompactConfig;
  codexFast: CodexFastConfig;
  tools: ToolsConfig;
};

export const DEFAULT_WORKING_MESSAGE_SETTINGS: WorkingMessageSettings = {
  language: "en",
};

export const DEFAULT_AUTO_COMPACT_CONFIG: AutoCompactConfig = {
  autoCompactPercent: 90,
  autoCompactTokenLimit: 0,
  keepRecentPercent: 15,
  strategy: "keep-recent",
};

export const DEFAULT_CODEX_FAST_CONFIG: CodexFastConfig = {
  enabled: false,
};

export const DEFAULT_TOOLS_CONFIG: ToolsConfig = Object.fromEntries(
  ALL_TOOL_IDS.map((id) => [id, true]),
) as ToolsConfig;

export const DEFAULT_CAPY_TOOLS_SETTINGS: CapyToolsSettings = {
  workingMessage: DEFAULT_WORKING_MESSAGE_SETTINGS,
  autoCompact: DEFAULT_AUTO_COMPACT_CONFIG,
  codexFast: DEFAULT_CODEX_FAST_CONFIG,
  tools: { ...DEFAULT_TOOLS_CONFIG },
};

export const AUTO_COMPACT_PRESETS = [80, 85, 90, 95] as const;
export const KEEP_RECENT_PRESETS = [5, 10, 15, 20] as const;

export const STRATEGY_LABELS: Record<CompactionStrategy, string> = {
  "keep-recent": "Keep recent only (default)",
  "keep-bookends": "Keep oldest + newest, compact middle",
  "summarize-all": "Summarize everything",
};

let currentSettings: CapyToolsSettings = structuredClone(DEFAULT_CAPY_TOOLS_SETTINGS);

export function parseLanguage(value: string): Language | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized in LANGUAGE_LABELS) return normalized as Language;

  const label = (Object.entries(LANGUAGE_LABELS) as Array<[Language, string]>).find(
    ([, candidate]) => candidate.toLowerCase() === normalized,
  );
  return label?.[0];
}

export function loadLanguageLabel(language: Language): string {
  return LANGUAGE_LABELS[language];
}

function parsePercent(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function parseStrategy(value: unknown): CompactionStrategy | undefined {
  return typeof value === "string" && value in STRATEGY_LABELS ? (value as CompactionStrategy) : undefined;
}

export function normalizeWorkingMessageSettings(value: unknown): WorkingMessageSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_WORKING_MESSAGE_SETTINGS };

  const language = typeof (value as { language?: unknown }).language === "string"
    ? parseLanguage((value as { language: string }).language)
    : undefined;

  return {
    language: language ?? DEFAULT_WORKING_MESSAGE_SETTINGS.language,
  };
}

export function normalizeAutoCompactConfig(value: unknown): AutoCompactConfig {
  if (!value || typeof value !== "object") return { ...DEFAULT_AUTO_COMPACT_CONFIG };

  const raw = value as Partial<Record<keyof AutoCompactConfig, unknown>>;
  return {
    autoCompactPercent: parsePercent(raw.autoCompactPercent, DEFAULT_AUTO_COMPACT_CONFIG.autoCompactPercent),
    autoCompactTokenLimit: parsePercent(raw.autoCompactTokenLimit, DEFAULT_AUTO_COMPACT_CONFIG.autoCompactTokenLimit),
    keepRecentPercent: parsePercent(raw.keepRecentPercent, DEFAULT_AUTO_COMPACT_CONFIG.keepRecentPercent),
    strategy: parseStrategy(raw.strategy) ?? DEFAULT_AUTO_COMPACT_CONFIG.strategy,
  };
}

export function normalizeCodexFastConfig(value: unknown): CodexFastConfig {
  if (!value || typeof value !== "object") return { ...DEFAULT_CODEX_FAST_CONFIG };
  const enabled = (value as { enabled?: unknown }).enabled;
  return {
    enabled: typeof enabled === "boolean" ? enabled : DEFAULT_CODEX_FAST_CONFIG.enabled,
  };
}

export function normalizeToolsConfig(value: unknown): ToolsConfig {
  const defaults = { ...DEFAULT_TOOLS_CONFIG };
  if (!value || typeof value !== "object") return defaults;

  const raw = value as Record<string, unknown>;
  for (const id of ALL_TOOL_IDS) {
    if (typeof raw[id] === "boolean") {
      (defaults as Record<string, boolean>)[id] = raw[id] as boolean;
    }
  }
  return defaults;
}

export function normalizeCapyToolsSettings(value: unknown): CapyToolsSettings {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_CAPY_TOOLS_SETTINGS);

  const raw = value as { workingMessage?: unknown; autoCompact?: unknown; codexFast?: unknown; tools?: unknown };
  return {
    // Legacy cat-whimsical config stored `language` at the top level.
    workingMessage: normalizeWorkingMessageSettings(raw.workingMessage ?? value),
    autoCompact: normalizeAutoCompactConfig(raw.autoCompact),
    codexFast: normalizeCodexFastConfig(raw.codexFast),
    tools: normalizeToolsConfig(raw.tools),
  };
}

function normalizeLegacyCodexFastSettings(value: unknown): CodexFastConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const extensionSettings = (value as Record<string, unknown>)["pi-codex-fast"];
  if (!extensionSettings || typeof extensionSettings !== "object") return undefined;
  return normalizeCodexFastConfig(extensionSettings);
}

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

async function writeSettings(settings: CapyToolsSettings): Promise<void> {
  await mkdir(dirname(CAPY_TOOLS_CONFIG_PATH), { recursive: true });
  await writeFile(CAPY_TOOLS_CONFIG_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  // Also sync tools config back to settings.json for unified management
  await syncToolsToPiSettings(settings.tools);
}

async function syncToolsToPiSettings(tools: ToolsConfig): Promise<void> {
  try {
    const raw = await readJson(LEGACY_PI_SETTINGS_PATH);
    const piSettings: Record<string, unknown> = (raw && typeof raw === "object")
      ? { ...raw as Record<string, unknown> }
      : {};
    piSettings["capyTools"] = {
      ...((piSettings["capyTools"] as Record<string, unknown>) ?? {}),
      tools,
    };
    await mkdir(dirname(LEGACY_PI_SETTINGS_PATH), { recursive: true });
    await writeFile(LEGACY_PI_SETTINGS_PATH, `${JSON.stringify(piSettings, null, 2)}\n`, "utf8");
  } catch {
    // Non-fatal: tools still saved to capy-tools.json
  }
}

export async function restoreCapyToolsSettings(): Promise<CapyToolsSettings> {
  const unifiedRaw = await readJson(CAPY_TOOLS_CONFIG_PATH);
  const hasUnified = !!unifiedRaw && typeof unifiedRaw === "object";
  const unifiedObject = hasUnified ? (unifiedRaw as Record<string, unknown>) : undefined;

  let next = normalizeCapyToolsSettings(unifiedRaw);
  let shouldWrite = !hasUnified;

  if (!unifiedObject || unifiedObject.workingMessage === undefined) {
    const legacyWorkingMessage = await readJson(LEGACY_WORKING_MESSAGE_CONFIG_PATH);
    if (legacyWorkingMessage !== undefined) {
      next = {
        ...next,
        workingMessage: normalizeWorkingMessageSettings(legacyWorkingMessage),
      };
      shouldWrite = true;
    }
  }

  if (!unifiedObject || unifiedObject.autoCompact === undefined) {
    const legacyAutoCompact = await readJson(LEGACY_AUTO_COMPACT_CONFIG_PATH);
    if (legacyAutoCompact !== undefined) {
      next = {
        ...next,
        autoCompact: normalizeAutoCompactConfig(legacyAutoCompact),
      };
      shouldWrite = true;
    }
  }

  if (!unifiedObject || unifiedObject.codexFast === undefined) {
    const legacyPiSettings = await readJson(LEGACY_PI_SETTINGS_PATH);
    const legacyCodexFast = normalizeLegacyCodexFastSettings(legacyPiSettings);
    if (legacyCodexFast !== undefined) {
      next = {
        ...next,
        codexFast: legacyCodexFast,
      };
      shouldWrite = true;
    }
  }

  currentSettings = next;

  if (!unifiedObject || unifiedObject.tools === undefined) {
    const piSettings = await readJson(LEGACY_PI_SETTINGS_PATH);
    if (piSettings && typeof piSettings === "object") {
      const capyTools = (piSettings as Record<string, unknown>)["capyTools"];
      if (capyTools && typeof capyTools === "object") {
        const toolsFromSettings = (capyTools as Record<string, unknown>)["tools"];
        if (toolsFromSettings) {
          next = {
            ...next,
            tools: normalizeToolsConfig(toolsFromSettings),
          };
          shouldWrite = true;
        }
      }
    }
  }

  currentSettings = next;
  if (shouldWrite) await writeSettings(currentSettings);
  return structuredClone(currentSettings);
}

export function getCapyToolsSettings(): CapyToolsSettings {
  return structuredClone(currentSettings);
}

export async function saveCapyToolsSettings(settings: CapyToolsSettings): Promise<CapyToolsSettings> {
  currentSettings = normalizeCapyToolsSettings(settings);
  await writeSettings(currentSettings);
  return structuredClone(currentSettings);
}

export async function updateCapyToolsSettings(
  updater: (settings: CapyToolsSettings) => CapyToolsSettings,
): Promise<CapyToolsSettings> {
  return await saveCapyToolsSettings(updater(structuredClone(currentSettings)));
}
