/**
 * Capy Tools fork of @juicesharp/rpiv-todo (MIT, juicesharp).
 *
 * Extension entry. Registers the `todo` tool, mounts the persistent overlay
 * widget above the editor, and replays todo state from the current branch
 * on session_start / session_compact / session_tree.
 *
 * Differences from upstream rpiv-todo:
 *   - No slash command for listing todos (passive surface, mirrors
 *     thinking-steps; the overlay is the only first-class UI surface).
 *   - No optional rpiv-i18n peer dep — English-only UI.
 *   - Overlay restyled to use `\u2022 / \u2502 / \u2514` visual language
 *     instead of `\u251c\u2500 / \u2514\u2500` tree branches.
 *   - Per-call render routes through `basic-tool-grouping` so consecutive
 *     todo calls collapse into one `Used N todos` group block (matching
 *     `Used N tools` / `Explored N targets`).
 *
 * Tool name "todo" is intentionally preserved so that session histories
 * persisted under rpiv-todo replay correctly here.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { replayFromBranch } from "./replay.ts";
import {
  applyTaskMutation,
  commitState,
  getState,
  replaceState,
} from "./state.ts";
import { buildTodoToolResult, renderTodoCall, renderTodoResult } from "./render.ts";
import { TodoOverlay } from "./overlay.ts";
import {
  type TaskAction,
  type TaskMutationParams,
  TOOL_LABEL,
  TOOL_NAME,
  TodoParamsSchema,
} from "./types.ts";

const PROMPT_SNIPPET = "Manage a task list to track multi-step progress";

const TODO_SYSTEM_PROMPT = [
  "Todo discipline:",
  "Use the `todo` tool immediately when the user gives you 3+ steps, a multi-task list, or any new set of instructions not yet captured.",
  "Skip it for single trivial requests and purely conversational turns.",
  "Before starting a task, mark it `in_progress`. The moment a task is done, mark it `completed` — never batch completions.",
  "Exactly one task is `in_progress` at a time.",
].join("\n");

const PROMPT_GUIDELINES: string[] = [
  "Use `todo` for complex work with 3+ steps, when the user gives you a list of tasks, or immediately after receiving new instructions to capture requirements. Skip it for single trivial tasks and purely conversational requests.",
  "When starting any task, mark it in_progress BEFORE beginning work. Mark it completed IMMEDIATELY when done — never batch completions. Exactly one task should be in_progress at a time.",
  "Never mark a task completed if tests are failing, the implementation is partial, or you hit unresolved errors — keep it in_progress and create a new task for the blocker instead.",
  "Task status is a 4-state machine: pending → in_progress → completed, plus deleted as a tombstone. Pass activeForm (present-continuous label, e.g. 'researching existing tool') when marking in_progress.",
  "Use blockedBy to express dependencies (A is blocked by B). On create, pass blockedBy as the initial set. On update, use addBlockedBy / removeBlockedBy (additive merge — do not resend the full array). Cycles are rejected.",
  "list hides tombstoned (deleted) tasks by default; pass includeDeleted:true to see them. Pass status to filter by a single status.",
  "Subject must be short and imperative (e.g. 'Research existing tool'); description is for long-form detail. activeForm is a present-continuous label shown while in_progress.",
];

export default function todoExtension(pi: ExtensionAPI): void {
  let overlay: TodoOverlay | undefined;

  pi.on("before_agent_start", () => ({ systemPrompt: TODO_SYSTEM_PROMPT }));

  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description:
      "Manage a task list for tracking multi-step progress. Actions: create (new task), update (change status/fields/dependencies), list (all tasks, optionally filtered by status), get (single task details), delete (tombstone), clear (reset all). Status: pending \u2192 in_progress \u2192 completed, plus deleted tombstone. Use this to plan and track multi-step work like research, design, and implementation.",
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: PROMPT_GUIDELINES,
    parameters: TodoParamsSchema,
    renderShell: "self",

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const action = params.action as TaskAction;
      const result = applyTaskMutation(getState(), action, params as unknown as TaskMutationParams);
      commitState(result.state);
      return buildTodoToolResult(action, params as unknown as TaskMutationParams, result.state, result.op);
    },

    renderCall(args, theme, context) {
      return renderTodoCall(args as unknown as TaskMutationParams & { action: TaskAction }, theme, context, getState());
    },

    renderResult(result, options, theme, context) {
      const ctxArgs = (context as { args?: unknown } | undefined)?.args as TaskMutationParams & { action: TaskAction } | undefined;
      const args = ctxArgs ?? { action: "list" as TaskAction };
      return renderTodoResult(args, result, options, theme, context, getState());
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    replaceState(replayFromBranch(ctx));
    if (ctx.hasUI) {
      overlay ??= new TodoOverlay();
      overlay.setUICtx(ctx.ui);
      overlay.resetCompletedDisplayState();
      overlay.update();
    }
  });

  pi.on("session_compact", async (_event, ctx) => {
    replaceState(replayFromBranch(ctx));
    overlay?.resetCompletedDisplayState();
    overlay?.update();
  });

  pi.on("session_tree", async (_event, ctx) => {
    replaceState(replayFromBranch(ctx));
    overlay?.resetCompletedDisplayState();
    overlay?.update();
  });

  pi.on("session_shutdown", async () => {
    overlay?.dispose();
    overlay = undefined;
  });

  // Refresh the overlay on every successful todo result. We deliberately do
  // NOT call replayFromBranch here — at tool_execution_end the branch is
  // still stale (message_end runs after); the live state cell already
  // reflects the mutation we just committed.
  pi.on("tool_execution_end", async (event) => {
    if (event.toolName !== TOOL_NAME || event.isError) return;
    overlay?.update();
  });

  pi.on("agent_start", async () => {
    overlay?.hideCompletedTasksFromPreviousTurn();
  });
}
