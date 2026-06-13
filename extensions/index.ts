import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { restoreCapyToolsSettings, getCapyToolsSettings } from "./capy-tools-config.ts";
import fetchExtension from "./fetch.ts";
import enableBuiltinSearchExtension from "./enable-builtin-search.ts";
import repoMapExtension from "./repo-map.ts";
import readBlockExtension from "./read-block.ts";
import symbolOutlineExtension from "./symbol-outline.ts";
import applyPatchExtension from "./apply-patch.ts";
import terminalSessionExtension from "./terminal-session.ts";
import askUserExtension from "./ask-user.ts";
import askQuestionExtension from "./ask-question.ts";
import askQuestionnaireExtension from "./ask-questionnaire.ts";
import sourcegraphExtension from "./sourcegraph.ts";
import recapExtension from "./recap.ts";
import messageShapeDiagnosticExtension from "./message-shape-diagnostic.ts";
import autoCompactExtension from "./auto-compact.ts";
import codexFastExtension from "./codex-fast.ts";
import capyToolsSettingsExtension from "./capy-tools-settings.ts";
import commandHistoryExtension from "./command-history.ts";
import effortsExtension from "./efforts/index.ts";
import codexGoalExtension from "./codex-goal/index.ts";
import rtkExtension from "./rtk/index.ts";
import thinkingStepsExtension from "./thinking-steps/index.ts";
import todoExtension from "./todo/index.ts";
import showsignatureExtension from "./showsignature.ts";
import workingMessageExtension from "./cat-whimsical/index.ts";

export default async function piBasicToolsExtension(pi: ExtensionAPI): Promise<void> {
  // Restore user config before deciding which tools to load.
  await restoreCapyToolsSettings();
  const tools = getCapyToolsSettings().tools;

  const enabled = (id: string): boolean => tools[id as keyof typeof tools] !== false;

  // enable-builtin-search is always loaded (needed for settings UI tool toggles)
  if (enabled("enable-builtin-search")) enableBuiltinSearchExtension(pi);
  if (enabled("fetch")) fetchExtension(pi);
  if (enabled("repo-map")) repoMapExtension(pi);
  if (enabled("read-block")) readBlockExtension(pi);
  if (enabled("symbol-outline")) symbolOutlineExtension(pi);
  if (enabled("apply-patch")) applyPatchExtension(pi);
  if (enabled("terminal-session")) terminalSessionExtension(pi);
  if (enabled("ask-user")) askUserExtension(pi);
  if (enabled("ask-question")) askQuestionExtension(pi);
  if (enabled("ask-questionnaire")) askQuestionnaireExtension(pi);
  if (enabled("sourcegraph")) sourcegraphExtension(pi);
  if (enabled("recap")) recapExtension(pi);
  // Opt-in diagnostic: no-op unless PI_BASIC_TOOLS_DIAG_SHAPES is set.
  if (enabled("message-shape-diagnostic")) messageShapeDiagnosticExtension(pi);
  if (enabled("auto-compact")) autoCompactExtension(pi);
  if (enabled("codex-fast")) codexFastExtension(pi);
  // capy-tools-settings MUST always load — otherwise users can't re-enable tools
  capyToolsSettingsExtension(pi);
  if (enabled("command-history")) commandHistoryExtension(pi);
  if (enabled("efforts")) effortsExtension(pi);
  if (enabled("codex-goal")) codexGoalExtension(pi);
  if (enabled("rtk")) await rtkExtension(pi);
  if (enabled("thinking-steps")) thinkingStepsExtension(pi);
  if (enabled("todo")) todoExtension(pi);
  if (enabled("showsignature")) showsignatureExtension(pi);
  // Registered AFTER todoExtension so the Capy Tools working message sits
  // below the todo overlay in pi's UI (forked from
  // https://github.com/lulucatdev/pi-cat-whimsical, MIT). See
  // extensions/cat-whimsical/index.ts header for full attribution.
  if (enabled("working-message")) workingMessageExtension(pi);
}
