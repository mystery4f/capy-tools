import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
  // Load all tools through one entrypoint so shared renderer state is truly shared.
  enableBuiltinSearchExtension(pi);
  fetchExtension(pi);
  repoMapExtension(pi);
  readBlockExtension(pi);
  symbolOutlineExtension(pi);
  applyPatchExtension(pi);
  terminalSessionExtension(pi);
  askUserExtension(pi);
  askQuestionExtension(pi);
  askQuestionnaireExtension(pi);
  sourcegraphExtension(pi);
  recapExtension(pi);
  // Opt-in diagnostic: no-op unless PI_BASIC_TOOLS_DIAG_SHAPES is set.
  messageShapeDiagnosticExtension(pi);
  autoCompactExtension(pi);
  codexFastExtension(pi);
  capyToolsSettingsExtension(pi);
  commandHistoryExtension(pi);
  effortsExtension(pi);
  codexGoalExtension(pi);
  await rtkExtension(pi);
  thinkingStepsExtension(pi);
  todoExtension(pi);
  showsignatureExtension(pi);
  // Registered AFTER todoExtension so the Capy Tools working message sits
  // below the todo overlay in pi's UI (forked from
  // https://github.com/lulucatdev/pi-cat-whimsical, MIT). See
  // extensions/cat-whimsical/index.ts header for full attribution.
  workingMessageExtension(pi);
}
