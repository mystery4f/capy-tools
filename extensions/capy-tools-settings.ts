import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  ALL_TOOL_IDS,
  AUTO_COMPACT_PRESETS,
  DEFAULT_AUTO_COMPACT_CONFIG,
  KEEP_RECENT_PRESETS,
  STRATEGY_LABELS,
  getCapyToolsSettings,
  loadLanguageLabel,
  parseLanguage,
  restoreCapyToolsSettings,
  updateCapyToolsSettings,
  type CompactionStrategy,
} from "./capy-tools-config.ts";
import { formatAutoCompactStatus, persistAutoCompactConfig } from "./auto-compact.ts";
import { formatCodexFastStatus, setCodexFastEnabled } from "./codex-fast.ts";

function formatSettingsSummary(): string {
  const settings = getCapyToolsSettings();
  const enabledCount = Object.values(settings.tools).filter(Boolean).length;
  return [
    `Working message language: ${loadLanguageLabel(settings.workingMessage.language)}`,
    `Auto-compact threshold: ${settings.autoCompact.autoCompactPercent}%`,
    `Keep recent budget:     ${settings.autoCompact.keepRecentPercent}%`,
    `Strategy:               ${STRATEGY_LABELS[settings.autoCompact.strategy]}`,
    `Codex fast mode:        ${settings.codexFast.enabled ? "enabled" : "disabled"}`,
    `Tools enabled:          ${enabledCount}/${ALL_TOOL_IDS.length}`,
  ].join("\n");
}

async function setWorkingMessageLanguage(ctx: ExtensionContext, languageText: string): Promise<boolean> {
  const language = parseLanguage(languageText);
  if (!language) {
    ctx.ui.notify("Use English, Chinese, Japanese, Korean, or the short codes en, zh, ja, ko.", "warning");
    return false;
  }

  await updateCapyToolsSettings((settings) => ({ ...settings, workingMessage: { language } }));
  ctx.ui.notify(`Capy Tools language set to ${loadLanguageLabel(language)}.`, "info");
  return true;
}

async function openToolsMenu(ctx: ExtensionContext): Promise<void> {
  while (true) {
    const settings = getCapyToolsSettings();
    const lines: string[] = [];
    for (const id of ALL_TOOL_IDS) {
      const icon = settings.tools[id] ? "✅" : "❌";
      lines.push(`${icon} ${id}`);
    }

    const choice = await ctx.ui.select(
      `Tools\n\n${lines.join("\n")}\n\nSelect a tool to toggle, or Done.`,
      [...ALL_TOOL_IDS.map((id) => `${settings.tools[id] ? "Disable" : "Enable"} ${id}`), "Done"],
    );

    if (!choice || choice === "Done") return;

    const match = choice.match(/^(Enable|Disable) (.+)$/);
    if (!match) continue;

    const toolId = match[2];
    const enable = match[1] === "Enable";

    await updateCapyToolsSettings((s) => ({
      ...s,
      tools: { ...s.tools, [toolId]: enable },
    }));
    ctx.ui.notify(`Tool "${toolId}" ${enable ? "enabled" : "disabled"}. Restart pi or /reload for changes.`, "info");
  }
}

async function openSettingsMenu(ctx: ExtensionContext): Promise<void> {
  await restoreCapyToolsSettings();

  while (true) {
    const settings = getCapyToolsSettings();
    const choice = await ctx.ui.select(
      `Capy Tools settings\n\n${formatSettingsSummary()}\n\nWhat would you like to change?`,
      [
        `Working message language [${loadLanguageLabel(settings.workingMessage.language)}]`,
        `Auto-compact threshold [${settings.autoCompact.autoCompactPercent}%]`,
        `Keep recent budget [${settings.autoCompact.keepRecentPercent}%]`,
        `Compaction strategy [${settings.autoCompact.strategy}]`,
        `Codex fast mode [${settings.codexFast.enabled ? "enabled" : "disabled"}]`,
        "Tools (enable/disable individual tools)",
        "Auto-compact status",
        "Codex fast status",
        "Reset auto-compact defaults",
        "Done",
      ],
    );

    if (!choice || choice === "Done") return;

    if (choice.startsWith("Working message language")) {
      const picked = await ctx.ui.select(
        "Working message language",
        ["English", "Chinese", "Japanese", "Korean"].map((label) =>
          label === loadLanguageLabel(settings.workingMessage.language) ? `${label} ✓` : label,
        ),
      );
      if (picked) await setWorkingMessageLanguage(ctx, picked.replace(/\s+✓$/, ""));
      continue;
    }

    if (choice.startsWith("Auto-compact threshold")) {
      const picked = await ctx.ui.select(
        "Auto-compact threshold (% of context window)",
        AUTO_COMPACT_PRESETS.map((preset) => `${preset}%${preset === settings.autoCompact.autoCompactPercent ? " ✓" : ""}`),
      );
      if (picked) {
        const autoCompactPercent = parseInt(picked, 10);
        if (!Number.isNaN(autoCompactPercent)) {
          await persistAutoCompactConfig({ autoCompactPercent });
          ctx.ui.notify(`Auto-compact threshold set to ${autoCompactPercent}%.`, "info");
        }
      }
      continue;
    }

    if (choice.startsWith("Keep recent budget")) {
      const picked = await ctx.ui.select(
        "Keep recent budget (% of context window to preserve)",
        KEEP_RECENT_PRESETS.map((preset) => `${preset}%${preset === settings.autoCompact.keepRecentPercent ? " ✓" : ""}`),
      );
      if (picked) {
        const keepRecentPercent = parseInt(picked, 10);
        if (!Number.isNaN(keepRecentPercent)) {
          await persistAutoCompactConfig({ keepRecentPercent });
          ctx.ui.notify(`Keep recent budget set to ${keepRecentPercent}%.`, "info");
        }
      }
      continue;
    }

    if (choice.startsWith("Compaction strategy")) {
      const strategies = Object.entries(STRATEGY_LABELS) as Array<[CompactionStrategy, string]>;
      const picked = await ctx.ui.select(
        "Compaction strategy",
        strategies.map(([key, label]) => `${label}${key === settings.autoCompact.strategy ? " ✓" : ""}`),
      );
      if (picked) {
        const entry = strategies.find(([, label]) => picked.startsWith(label));
        if (entry) {
          await persistAutoCompactConfig({ strategy: entry[0] });
          ctx.ui.notify(`Compaction strategy set to ${entry[1]}.`, "info");
        }
      }
      continue;
    }

    if (choice.startsWith("Codex fast mode")) {
      const next = !settings.codexFast.enabled;
      setCodexFastEnabled(next, ctx);
      continue;
    }

    if (choice.startsWith("Tools")) {
      await openToolsMenu(ctx);
      continue;
    }

    if (choice === "Auto-compact status") {
      ctx.ui.notify(formatAutoCompactStatus(ctx), "info");
      continue;
    }

    if (choice === "Codex fast status") {
      ctx.ui.notify(formatCodexFastStatus(), "info");
      continue;
    }

    if (choice === "Reset auto-compact defaults") {
      const ok = await ctx.ui.confirm(
        "Reset auto-compact defaults?",
        "This resets only the auto-compact section. Working-message language is preserved.",
      );
      if (ok) {
        await persistAutoCompactConfig({ ...DEFAULT_AUTO_COMPACT_CONFIG });
        ctx.ui.notify("Auto-compact settings reset to defaults.", "info");
      }
    }
  }
}

export default function capyToolsSettingsExtension(pi: ExtensionAPI): void {
  pi.registerCommand("capy-tools-settings", {
    description: "Open the Capy Tools settings panel.",
    getArgumentCompletions: (prefix: string) => {
      const values = [
        "settings",
        "status",
        "reset-auto-compact",
        "codex-fast on",
        "codex-fast off",
        "codex-fast toggle",
        "codex-fast status",
        "tools",
        ...ALL_TOOL_IDS.flatMap((id) => [`enable ${id}`, `disable ${id}`]),
        "en",
        "zh",
        "ja",
        "ko",
        "English",
        "Chinese",
        "Japanese",
        "Korean",
      ];
      return values.filter((value) => value.toLowerCase().startsWith(prefix.toLowerCase())).map((value) => ({ value }));
    },
    handler: async (args, ctx) => {
      await restoreCapyToolsSettings();
      const trimmed = args.trim();

      if (!trimmed || trimmed === "settings") {
        await openSettingsMenu(ctx);
        return;
      }

      if (trimmed === "status" || trimmed === "auto-compact status") {
        ctx.ui.notify(formatAutoCompactStatus(ctx), "info");
        return;
      }

      if (trimmed === "codex-fast status") {
        ctx.ui.notify(formatCodexFastStatus(), "info");
        return;
      }

      if (trimmed === "codex-fast on" || trimmed === "enable-codex-fast") {
        setCodexFastEnabled(true, ctx);
        return;
      }

      if (trimmed === "codex-fast off" || trimmed === "disable-codex-fast") {
        setCodexFastEnabled(false, ctx);
        return;
      }

      if (trimmed === "codex-fast toggle") {
        setCodexFastEnabled(!getCapyToolsSettings().codexFast.enabled, ctx);
        return;
      }

      if (trimmed === "tools") {
        await openToolsMenu(ctx);
        return;
      }

      const enableMatch = trimmed.match(/^enable (.+)$/i);
      if (enableMatch) {
        const toolId = enableMatch[1].trim();
        if (!ALL_TOOL_IDS.includes(toolId as typeof ALL_TOOL_IDS[number])) {
          ctx.ui.notify(`Unknown tool: ${toolId}`, "warning");
          return;
        }
        await updateCapyToolsSettings((s) => ({ ...s, tools: { ...s.tools, [toolId]: true } }));
        ctx.ui.notify(`Tool "${toolId}" enabled. Restart pi or /reload for changes.`, "info");
        return;
      }

      const disableMatch = trimmed.match(/^disable (.+)$/i);
      if (disableMatch) {
        const toolId = disableMatch[1].trim();
        if (!ALL_TOOL_IDS.includes(toolId as typeof ALL_TOOL_IDS[number])) {
          ctx.ui.notify(`Unknown tool: ${toolId}`, "warning");
          return;
        }
        await updateCapyToolsSettings((s) => ({ ...s, tools: { ...s.tools, [toolId]: false } }));
        ctx.ui.notify(`Tool "${toolId}" disabled. Restart pi or /reload for changes.`, "info");
        return;
      }

      if (trimmed === "reset-auto-compact" || trimmed === "auto-compact reset") {
        await persistAutoCompactConfig({ ...DEFAULT_AUTO_COMPACT_CONFIG });
        ctx.ui.notify("Auto-compact settings reset to defaults.", "info");
        return;
      }

      if (await setWorkingMessageLanguage(ctx, trimmed)) return;

      ctx.ui.notify(
        "Usage: /capy-tools-settings [settings|status|tools|enable <tool>|disable <tool>|codex-fast on|off|en|zh|ja|ko]",
        "warning",
      );
    },
  });
}
