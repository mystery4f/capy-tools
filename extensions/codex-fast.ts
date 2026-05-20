/**
 * OpenAI/OpenAI Codex priority service-tier toggle.
 *
 * Forked from `@calesennett/pi-codex-fast` v0.1.1. The request-patching
 * behavior is preserved, while persistence is moved into Capy Tools' unified
 * `~/.pi/agent/capy-tools.json` store under `codexFast`.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  getCapyToolsSettings,
  restoreCapyToolsSettings,
  updateCapyToolsSettings,
  type CodexFastConfig,
} from "./capy-tools-config.ts";

const STATUS_KEY = "capy-codex-fast";

type PriorityModel = {
  id?: string;
  provider?: string;
};

let fastModeEnabled = false;
let priorityServiceTierSupported = false;
let activeModelLabel = "no active model";
let settingsWriteQueue: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function supportsPriorityServiceTier(model: PriorityModel | undefined): boolean {
  return model?.provider === "openai" || model?.provider === "openai-codex";
}

function formatModelLabel(model: PriorityModel | undefined): string {
  return model ? `${model.provider ?? "unknown"}/${model.id ?? "unknown"}` : "no active model";
}

function refreshModelState(model: PriorityModel | undefined): void {
  priorityServiceTierSupported = supportsPriorityServiceTier(model);
  activeModelLabel = formatModelLabel(model);
}

function refreshModelStateFromContext(ctx: ExtensionContext): void {
  try {
    refreshModelState(ctx.model as PriorityModel | undefined);
  } catch {
    refreshModelState(undefined);
  }
}

function renderStatusText(ctx: ExtensionContext, text: string): string {
  try {
    return ctx.ui.theme?.fg("accent", text) ?? text;
  } catch {
    return text;
  }
}

function updateStatus(ctx: ExtensionContext): void {
  try {
    if (!ctx.hasUI) return;
    if (!fastModeEnabled) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }

    const label = priorityServiceTierSupported ? "OpenAI fast mode" : "fast mode inactive";
    ctx.ui.setStatus(STATUS_KEY, renderStatusText(ctx, label));
  } catch {
    // Ignore stale ctx after session replacement or reload.
  }
}

function notifyState(ctx: ExtensionContext): void {
  try {
    if (!ctx.hasUI) return;
    if (!fastModeEnabled) {
      ctx.ui.notify("Fast mode disabled. OpenAI/OpenAI Codex requests will use the default service tier.", "info");
      return;
    }

    if (priorityServiceTierSupported) {
      ctx.ui.notify("Fast mode enabled. OpenAI/OpenAI Codex requests will send service_tier=priority.", "info");
      return;
    }

    ctx.ui.notify(
      `Fast mode enabled. It will apply once you switch to an OpenAI or OpenAI Codex model (current: ${activeModelLabel}).`,
      "info",
    );
  } catch {
    // Ignore stale ctx after session replacement or reload.
  }
}

export async function persistCodexFastConfig(config: Partial<CodexFastConfig>): Promise<CodexFastConfig> {
  const settings = await updateCapyToolsSettings((current) => ({
    ...current,
    codexFast: {
      ...current.codexFast,
      ...config,
    },
  }));
  return settings.codexFast;
}

export function formatCodexFastStatus(): string {
  return [
    `Enabled: ${fastModeEnabled ? "yes" : "no"}`,
    `Active model: ${activeModelLabel}`,
    `Current model supports priority tier: ${priorityServiceTierSupported ? "yes" : "no"}`,
  ].join("\n");
}

export function setCodexFastEnabled(
  enabled: boolean,
  ctx: ExtensionContext,
  options: { persist?: boolean; notify?: boolean } = {},
): void {
  fastModeEnabled = enabled;

  if (options.persist !== false) {
    settingsWriteQueue = settingsWriteQueue.catch(() => undefined).then(async () => {
      await persistCodexFastConfig({ enabled });
    });

    void settingsWriteQueue.catch((error) => {
      try {
        if (!ctx.hasUI) return;
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`codex-fast: failed to write settings: ${message}`, "warning");
      } catch {
        // Ignore stale ctx after session replacement or reload.
      }
    });
  }

  updateStatus(ctx);
  if (options.notify !== false) notifyState(ctx);
}

async function reloadFastModeState(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  options: { includeStartupFlag?: boolean } = {},
): Promise<void> {
  refreshModelStateFromContext(ctx);
  await settingsWriteQueue.catch(() => undefined);
  await restoreCapyToolsSettings();

  fastModeEnabled = getCapyToolsSettings().codexFast.enabled;

  if (options.includeStartupFlag === true && pi.getFlag("fast") === true) {
    fastModeEnabled = true;
  }

  updateStatus(ctx);
}

export default function codexFastExtension(pi: ExtensionAPI): void {
  pi.registerFlag("fast", {
    description: "Start with fast mode enabled (adds service_tier=priority to OpenAI/OpenAI Codex requests)",
    type: "boolean",
    default: false,
  });

  pi.registerCommand("codex-fast", {
    description: "Toggle OpenAI/OpenAI Codex priority service tier",
    handler: async (_args, ctx) => {
      setCodexFastEnabled(!fastModeEnabled, ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    await reloadFastModeState(pi, ctx, { includeStartupFlag: true });
  });

  pi.on("model_select", async (event, ctx) => {
    refreshModelState(event.model as PriorityModel | undefined);
    updateStatus(ctx);
  });

  pi.on("before_provider_request", (event) => {
    if (!fastModeEnabled || !priorityServiceTierSupported || !isRecord(event.payload)) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(event.payload, "service_tier")) {
      return;
    }

    return {
      ...event.payload,
      service_tier: "priority",
    };
  });
}
