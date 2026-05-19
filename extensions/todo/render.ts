/**
 * Capy Tools fork of @juicesharp/rpiv-todo (MIT, juicesharp).
 *
 * Per-call render hooks for the `todo` tool.
 *
 * Visual language is aligned with the rest of Capy Tools' compact tool
 * grouping (`extensions/basic-tool-grouping.ts`):
 *
 *   • Added <subject>            ← create
 *   • Started <subject>          ← update → in_progress
 *   • Done <subject>             ← update → completed
 *   • Reopened <subject>         ← update → pending (from in_progress)
 *   • Updated <subject>          ← update with no status change
 *   • Removed <subject>          ← delete (tombstone)
 *   • Listed todos               ← list
 *   • Read todo <subject>        ← get
 *   • Cleared todos              ← clear
 *
 * When the agent fires several todo calls in a row, basic-tool-grouping
 * collapses them under a single `Used N todos` group header — matching the
 * `Used N tools` / `Explored N targets` / `Ran N commands` family.
 *
 * The tool result envelope continues to format LLM-facing summaries (e.g.
 * `Created #3: Subject (pending)`) byte-equivalent to upstream rpiv-todo
 * so that branch replay across versions stays stable.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  canGroupTool,
  renderGroupedToolCall,
  renderGroupedToolResult,
  summarizeToolCall,
  type BasicToolSummary,
} from "../basic-tool-grouping.ts";
import {
  deriveBlocks,
  type Op,
  selectTaskSubjectById,
  type TaskState,
} from "./state.ts";
import {
  formatStatusLabel,
  type Task,
  type TaskAction,
  type TaskDetails,
  type TaskMutationParams,
  TOOL_NAME,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Summary helpers — feed `summarizeToolCall("todo", args)` so that
// basic-tool-grouping pulls a stable verb / target for the per-call row and
// for the group title aggregation.
// ---------------------------------------------------------------------------

function pickSubject(args: TaskMutationParams, state: TaskState): string | undefined {
  if (typeof args.subject === "string" && args.subject.trim()) return args.subject;
  if (typeof args.id === "number") return selectTaskSubjectById(state, args.id);
  return undefined;
}

/**
 * Build the BasicToolSummary that basic-tool-grouping uses for this call.
 * `title` carries the human verb so the per-call row reads
 * `• <verb> <target>` (see `actionHeadline` in basic-tool-grouping.ts).
 * `role: "plan"` tags the row so a same-role group collapses to
 * `Tracked N todos`; mixed-role groups fall back to `Used N tools`.
 */
export function summarizeTodoCall(args: TaskMutationParams & { action: TaskAction }, state: TaskState): BasicToolSummary {
  const subject = pickSubject(args, state);
  switch (args.action) {
    case "create":
      return { title: "Added", target: subject, role: "plan" };
    case "update": {
      if (args.status === "in_progress") return { title: "Started", target: subject, role: "plan" };
      if (args.status === "completed") return { title: "Done", target: subject, role: "plan" };
      if (args.status === "pending") return { title: "Reopened", target: subject, role: "plan" };
      if (args.status === "deleted") return { title: "Removed", target: subject, role: "plan" };
      return { title: "Updated", target: subject, role: "plan" };
    }
    case "delete":
      return { title: "Removed", target: subject, role: "plan" };
    case "get":
      return { title: "Read todo", target: subject, role: "plan" };
    case "list":
      return { title: "Listed todos", role: "plan" };
    case "clear":
      return { title: "Cleared todos", role: "plan" };
  }
}

/**
 * Summarize the result envelope. Adds an inline detail (e.g. `· #3 pending`
 * / `· #2 → completed`) so the per-call row carries the outcome after the
 * tool returns, exactly like `Read foo.ts · 5 lines`.
 */
export function summarizeTodoResult(
  result: { details?: unknown },
  fallback: BasicToolSummary,
): BasicToolSummary {
  const details = result.details as TaskDetails | undefined;
  if (!details) return fallback;
  if (details.error) return { ...fallback, detail: details.error };

  switch (details.action) {
    case "create": {
      const created = details.tasks[details.tasks.length - 1];
      if (!created) return fallback;
      return { ...fallback, target: created.subject, detail: `#${created.id} ${formatStatusLabel(created.status)}` };
    }
    case "update": {
      const params = details.params as TaskMutationParams;
      if (typeof params.id !== "number") return fallback;
      const updated = details.tasks.find((t) => t.id === params.id);
      if (!updated) return fallback;
      const target = updated.subject;
      const detail = params.status !== undefined ? `#${updated.id} \u2192 ${formatStatusLabel(updated.status)}` : `#${updated.id}`;
      return { ...fallback, target, detail };
    }
    case "delete": {
      const params = details.params as TaskMutationParams;
      if (typeof params.id !== "number") return fallback;
      return { ...fallback, detail: `#${params.id}` };
    }
    case "list": {
      const visible = details.tasks.filter((t) => t.status !== "deleted");
      return { ...fallback, detail: `${visible.length} todo${visible.length === 1 ? "" : "s"}` };
    }
    case "get": {
      const params = details.params as TaskMutationParams;
      if (typeof params.id !== "number") return fallback;
      const task = details.tasks.find((t) => t.id === params.id);
      if (!task) return fallback;
      return { ...fallback, target: task.subject, detail: `#${task.id} ${formatStatusLabel(task.status)}` };
    }
    case "clear":
      return { ...fallback, detail: `${details.tasks.length} remaining` };
  }
}

// ---------------------------------------------------------------------------
// Standalone fallback — used when basic-tool-grouping context is missing.
// ---------------------------------------------------------------------------

function renderStandaloneCall(args: TaskMutationParams & { action: TaskAction }, theme: Theme, state: TaskState): Text {
  const summary = summarizeTodoCall(args, state);
  const verb = summary.title ?? args.action;
  const target = summary.target ? ` ${summary.target}` : "";
  return new Text(theme.fg("muted", `${verb}${target}`), 0, 0);
}

function renderStandaloneResult(result: { details?: unknown }, theme: Theme, fallback: BasicToolSummary): Text {
  const summary = summarizeTodoResult(result, fallback);
  const verb = summary.title ?? "Done";
  const target = summary.target ? ` ${summary.target}` : "";
  const detail = summary.detail ? theme.fg("muted", ` \u00b7 ${summary.detail}`) : "";
  const headlineColor = (result as { isError?: boolean }).isError ? "error" : "muted";
  return new Text(theme.fg(headlineColor, `${verb}${target}`) + detail, 0, 0);
}

// ---------------------------------------------------------------------------
// renderCall / renderResult entry points wired into registerTool().
// ---------------------------------------------------------------------------

export function renderTodoCall(args: TaskMutationParams & { action: TaskAction }, theme: Theme, context: unknown, state: TaskState) {
  const summary = summarizeTodoCall(args, state);
  // Bridge into basic-tool-grouping so consecutive todo calls collapse the
  // same way Read / Search / Ran calls do. summarizeToolCall("todo", args)
  // returns a baseline BasicToolSummary that we override with the richer
  // todo-aware summary we just computed.
  void summarizeToolCall;
  if (!canGroupTool(context)) return renderStandaloneCall(args, theme, state);
  return renderGroupedToolCall(TOOL_NAME, args as unknown as Record<string, unknown>, theme, context, summary);
}

export function renderTodoResult(
  args: TaskMutationParams & { action: TaskAction },
  result: { details?: unknown; isError?: boolean },
  options: { expanded?: boolean; isPartial?: boolean },
  theme: Theme,
  context: unknown,
  state: TaskState,
) {
  const callSummary = summarizeTodoCall(args, state);
  const resultSummary = summarizeTodoResult(result, callSummary);
  if (!canGroupTool(context)) return renderStandaloneResult(result, theme, callSummary);
  return renderGroupedToolResult(TOOL_NAME, result, options, theme, context, resultSummary);
}

// ---------------------------------------------------------------------------
// LLM-facing tool envelope text. Byte-equivalent to upstream so that branch
// replay across versions stays stable.
// ---------------------------------------------------------------------------

function formatListLine(t: Task): string {
  const block = t.blockedBy?.length ? ` \u26d3 ${t.blockedBy.map((id) => `#${id}`).join(",")}` : "";
  const form = t.status === "in_progress" && t.activeForm ? ` (${t.activeForm})` : "";
  return `[${t.status}] #${t.id} ${t.subject}${form}${block}`;
}

function formatGetLines(task: Task, state: TaskState): string {
  const blocks = deriveBlocks(state.tasks).get(task.id) ?? [];
  const lines = [`#${task.id} [${task.status}] ${task.subject}`];
  if (task.description) lines.push(`  description: ${task.description}`);
  if (task.activeForm) lines.push(`  activeForm: ${task.activeForm}`);
  if (task.blockedBy?.length) {
    lines.push(`  blockedBy: ${task.blockedBy.map((id) => `#${id}`).join(", ")}`);
  }
  if (blocks.length) {
    lines.push(`  blocks: ${blocks.map((id) => `#${id}`).join(", ")}`);
  }
  if (task.owner) lines.push(`  owner: ${task.owner}`);
  return lines.join("\n");
}

export function formatToolContent(op: Op, state: TaskState): string {
  switch (op.kind) {
    case "create": {
      const t = state.tasks.find((x) => x.id === op.taskId);
      if (!t) return `Created #${op.taskId}`;
      return `Created #${t.id}: ${t.subject} (pending)`;
    }
    case "update": {
      const transition = op.fromStatus !== op.toStatus ? ` (${op.fromStatus} \u2192 ${op.toStatus})` : "";
      return `Updated #${op.id}${transition}`;
    }
    case "delete":
      return `Deleted #${op.id}: ${op.subject}`;
    case "clear":
      return `Cleared ${op.count} tasks`;
    case "list": {
      let view = state.tasks;
      if (!op.includeDeleted) view = view.filter((t) => t.status !== "deleted");
      if (op.statusFilter) view = view.filter((t) => t.status === op.statusFilter);
      return view.length === 0 ? "No tasks" : view.map(formatListLine).join("\n");
    }
    case "get":
      return formatGetLines(op.task, state);
    case "error":
      return `Error: ${op.message}`;
  }
}

export function buildTodoToolResult(
  action: TaskAction,
  params: TaskMutationParams,
  state: TaskState,
  op: Op,
): { content: Array<{ type: "text"; text: string }>; details: TaskDetails } {
  const text = formatToolContent(op, state);
  const details: TaskDetails = {
    action,
    params: params as Record<string, unknown>,
    tasks: state.tasks,
    nextId: state.nextId,
    ...(op.kind === "error" ? { error: op.message } : {}),
  };
  return { content: [{ type: "text", text }], details };
}
