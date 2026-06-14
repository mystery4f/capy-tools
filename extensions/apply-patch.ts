import { mkdir, lstat, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { canGroupTool, renderGroupedToolCall, renderGroupedToolResult, summarizeToolCall } from "./basic-tool-grouping.ts";
import { Type } from "@sinclair/typebox";

const BEGIN_PATCH = "*** Begin Patch";
const END_PATCH = "*** End Patch";
const ENVIRONMENT_ID = "*** Environment ID: ";
const ADD_FILE = "*** Add File: ";
const DELETE_FILE = "*** Delete File: ";
const UPDATE_FILE = "*** Update File: ";
const MOVE_TO = "*** Move to: ";
const EOF_MARKER = "*** End of File";
const CHANGE_CONTEXT = "@@ ";
const EMPTY_CHANGE_CONTEXT = "@@";

const applyPatchSchema = Type.Object({
  patch: Type.String({ description: "Codex-style patch text starting with *** Begin Patch and ending with *** End Patch" }),
  workdir: Type.Optional(Type.String({ description: "Working directory for resolving relative patch paths; defaults to the current project directory" })),
});

type Hunk = AddHunk | DeleteHunk | UpdateHunk;
type AddHunk = { kind: "add"; path: string; contents: string };
type DeleteHunk = { kind: "delete"; path: string };
type UpdateHunk = { kind: "update"; path: string; movePath?: string; chunks: UpdateChunk[] };
type UpdateChunk = {
  changeContext?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
};

type AppliedChange = {
  type: "A" | "M" | "D";
  path: string;
  absolutePath: string;
  movePath?: string;
  absoluteMovePath?: string;
};

type ApplyPatchDetails = {
  status: "success" | "failed";
  cwd: string;
  totalFiles: number;
  added: number;
  modified: number;
  deleted: number;
  changes: AppliedChange[];
  error?: string;
  partialFailure: boolean;
};

type ParsedPatch = {
  hunks: Hunk[];
  environmentId?: string;
};

function safeKeyHint(keybinding: string, description: string): string {
  try {
    return keyHint(keybinding, description);
  } catch {
    return `(${description})`;
  }
}

function fallbackText(result: any): string {
  const content = result.content?.[0];
  return content?.type === "text" ? content.text : "";
}

function renderApplyPatchResult(result: any, { expanded, isPartial }: { expanded?: boolean; isPartial?: boolean }, theme: any) {
  if (isPartial) return new Text(theme.fg("warning", "Applying patch..."), 0, 0);

  const details = result.details as ApplyPatchDetails | undefined;
  const fullText = fallbackText(result);
  if (!details) return new Text(fullText, 0, 0);
  if (expanded) return new Text(fullText, 0, 0);

  const hint = safeKeyHint("app.tools.expand", "to expand");
  if (details.status === "failed") {
    const suffix = details.changes.length > 0 ? ` after ${details.changes.length} changes` : "";
    return new Text(theme.fg("error", "apply patch failed") + theme.fg("muted", `${suffix} ${hint}`), 0, 0);
  }

  const summary = `${details.totalFiles} files A${details.added} M${details.modified} D${details.deleted}`;
  return new Text(theme.fg("success", "apply patch ") + theme.fg("accent", summary) + theme.fg("muted", ` ${hint}`), 0, 0);
}

function unwrapLenientPatch(raw: string): string {
  const trimmed = raw.trim();
  const lines = trimmed.split(/\r?\n/);
  const first = lines[0];
  const last = lines[lines.length - 1];
  if ((first === "<<EOF" || first === "<<'EOF'" || first === '<<"EOF"') && last?.endsWith("EOF") && lines.length >= 4) {
    return lines.slice(1, -1).join("\n").trim();
  }
  return trimmed;
}

function parsePatch(raw: string): ParsedPatch {
  const patch = unwrapLenientPatch(raw);
  const lines = patch.split(/\r?\n/);
  if (lines.length < 2 || lines[0].trim() !== BEGIN_PATCH || lines[lines.length - 1].trim() !== END_PATCH) {
    throw new Error(`invalid patch: expected '${BEGIN_PATCH}' and '${END_PATCH}' markers`);
  }

  let body = lines.slice(1, -1);
  let environmentId: string | undefined;
  const firstBodyLine = body[0]?.trimStart();
  if (firstBodyLine?.startsWith(ENVIRONMENT_ID)) {
    environmentId = firstBodyLine.slice(ENVIRONMENT_ID.length).trim();
    if (!environmentId) throw new Error("invalid patch: apply_patch environment_id cannot be empty");
    body = body.slice(1);
  }

  const hunks: Hunk[] = [];
  let offset = 2 + (environmentId ? 1 : 0);
  while (body.length > 0) {
    if (body[0].trim() === "") {
      body = body.slice(1);
      offset += 1;
      continue;
    }
    const { hunk, consumed } = parseOneHunk(body, offset);
    hunks.push(hunk);
    body = body.slice(consumed);
    offset += consumed;
  }

  if (hunks.length === 0) throw new Error("invalid patch: No files were modified.");
  return { hunks, environmentId };
}

function parseOneHunk(lines: string[], lineNumber: number): { hunk: Hunk; consumed: number } {
  const firstLine = lines[0].trim();
  const addPath = firstLine.startsWith(ADD_FILE) ? firstLine.slice(ADD_FILE.length) : undefined;
  if (addPath !== undefined) {
    let contents = "";
    let consumed = 1;
    for (const line of lines.slice(1)) {
      if (!line.startsWith("+")) break;
      contents += `${line.slice(1)}\n`;
      consumed += 1;
    }
    return { hunk: { kind: "add", path: addPath, contents }, consumed };
  }

  const deletePath = firstLine.startsWith(DELETE_FILE) ? firstLine.slice(DELETE_FILE.length) : undefined;
  if (deletePath !== undefined) {
    return { hunk: { kind: "delete", path: deletePath }, consumed: 1 };
  }

  const updatePath = firstLine.startsWith(UPDATE_FILE) ? firstLine.slice(UPDATE_FILE.length) : undefined;
  if (updatePath !== undefined) {
    let remaining = lines.slice(1);
    let consumed = 1;
    let movePath: string | undefined;
    const firstRemaining = remaining[0]?.trim();
    if (firstRemaining?.startsWith(MOVE_TO)) {
      movePath = firstRemaining.slice(MOVE_TO.length);
      remaining = remaining.slice(1);
      consumed += 1;
    }

    const chunks: UpdateChunk[] = [];
    while (remaining.length > 0) {
      if (remaining[0].trim() === "") {
        remaining = remaining.slice(1);
        consumed += 1;
        continue;
      }
      if (remaining[0].startsWith("*")) break;

      const parsed = parseUpdateChunk(remaining, lineNumber + consumed, chunks.length === 0);
      chunks.push(parsed.chunk);
      remaining = remaining.slice(parsed.consumed);
      consumed += parsed.consumed;
    }

    if (chunks.length === 0) {
      throw new Error(`invalid hunk at line ${lineNumber}: Update file hunk for path '${updatePath}' is empty`);
    }
    return { hunk: { kind: "update", path: updatePath, movePath, chunks }, consumed };
  }

  throw new Error(
    `invalid hunk at line ${lineNumber}: '${firstLine}' is not a valid hunk header. Valid hunk headers: '${ADD_FILE}{path}', '${DELETE_FILE}{path}', '${UPDATE_FILE}{path}'`,
  );
}

function parseUpdateChunk(lines: string[], lineNumber: number, allowMissingContext: boolean): { chunk: UpdateChunk; consumed: number } {
  if (lines.length === 0) throw new Error(`invalid hunk at line ${lineNumber}: Update hunk does not contain any lines`);

  let changeContext: string | undefined;
  let startIndex = 0;
  if (lines[0] === EMPTY_CHANGE_CONTEXT) {
    startIndex = 1;
  } else if (lines[0].startsWith(CHANGE_CONTEXT)) {
    changeContext = lines[0].slice(CHANGE_CONTEXT.length);
    startIndex = 1;
  } else if (!allowMissingContext) {
    throw new Error(`invalid hunk at line ${lineNumber}: Expected update hunk to start with a @@ context marker, got: '${lines[0]}'`);
  }

  if (startIndex >= lines.length) {
    throw new Error(`invalid hunk at line ${lineNumber + 1}: Update hunk does not contain any lines`);
  }

  const chunk: UpdateChunk = { changeContext, oldLines: [], newLines: [], isEndOfFile: false };
  let parsedLines = 0;
  for (const line of lines.slice(startIndex)) {
    if (line === EOF_MARKER) {
      if (parsedLines === 0) throw new Error(`invalid hunk at line ${lineNumber + 1}: Update hunk does not contain any lines`);
      chunk.isEndOfFile = true;
      parsedLines += 1;
      break;
    }

    const first = line[0];
    if (first === undefined) {
      chunk.oldLines.push("");
      chunk.newLines.push("");
    } else if (first === " ") {
      chunk.oldLines.push(line.slice(1));
      chunk.newLines.push(line.slice(1));
    } else if (first === "+") {
      chunk.newLines.push(line.slice(1));
    } else if (first === "-") {
      chunk.oldLines.push(line.slice(1));
    } else {
      if (parsedLines === 0) {
        throw new Error(
          `invalid hunk at line ${lineNumber + 1}: Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`,
        );
      }
      break;
    }
    parsedLines += 1;
  }

  return { chunk, consumed: parsedLines + startIndex };
}

function resolvePatchPath(cwd: string, patchPath: string): string {
  return isAbsolute(patchPath) ? resolve(patchPath) : resolve(cwd, patchPath);
}

function displayPath(cwd: string, absolutePath: string, originalPath?: string): string {
  if (originalPath && isAbsolute(originalPath)) return originalPath;
  const rel = relative(cwd, absolutePath);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : absolutePath;
}

function splitFileLines(contents: string): string[] {
  const lines = contents.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function normalizeForFuzzyMatch(value: string): string {
  return value
    .trim()
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g, " ");
}

function seekSequence(lines: string[], pattern: string[], start: number, eof: boolean): number | undefined {
  if (pattern.length === 0) return start;
  if (pattern.length > lines.length) return undefined;
  const searchStart = eof && lines.length >= pattern.length ? lines.length - pattern.length : start;
  const maxStart = lines.length - pattern.length;

  const passes = [
    (line: string, pat: string) => line === pat,
    (line: string, pat: string) => line.trimEnd() === pat.trimEnd(),
    (line: string, pat: string) => line.trim() === pat.trim(),
    (line: string, pat: string) => normalizeForFuzzyMatch(line) === normalizeForFuzzyMatch(pat),
  ];

  for (const matches of passes) {
    for (let i = searchStart; i <= maxStart; i += 1) {
      let ok = true;
      for (let j = 0; j < pattern.length; j += 1) {
        if (!matches(lines[i + j], pattern[j])) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
  }

  return undefined;
}

function computeReplacements(originalLines: string[], path: string, chunks: UpdateChunk[]): Array<[number, number, string[]]> {
  const replacements: Array<[number, number, string[]]> = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    if (chunk.changeContext !== undefined) {
      const index = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
      if (index === undefined) throw new Error(`Failed to find context '${chunk.changeContext}' in ${path}`);
      lineIndex = index + 1;
    }

    if (chunk.oldLines.length === 0) {
      replacements.push([originalLines.length, 0, [...chunk.newLines]]);
      continue;
    }

    let pattern = chunk.oldLines;
    let newSlice = chunk.newLines;
    let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
    if (found === undefined && pattern.at(-1) === "") {
      pattern = pattern.slice(0, -1);
      if (newSlice.at(-1) === "") newSlice = newSlice.slice(0, -1);
      found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
    }
    if (found === undefined) {
      throw new Error(`Failed to find expected lines in ${path}:\n${chunk.oldLines.join("\n")}`);
    }

    replacements.push([found, pattern.length, [...newSlice]]);
    lineIndex = found + pattern.length;
  }

  return replacements.sort((lhs, rhs) => lhs[0] - rhs[0]);
}

function applyReplacements(lines: string[], replacements: Array<[number, number, string[]]>): string[] {
  const next = [...lines];
  for (const [start, deleteCount, insertLines] of [...replacements].reverse()) {
    next.splice(start, deleteCount, ...insertLines);
  }
  return next;
}

async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function ensureNotDirectory(path: string, action: string): Promise<void> {
  const stats = await lstat(path);
  if (stats.isDirectory()) throw new Error(`Failed to ${action} ${path}: path is a directory`);
}

async function deriveNewContents(path: string, chunks: UpdateChunk[]): Promise<string> {
  const original = await readFile(path, "utf8");
  const originalLines = splitFileLines(original);
  const replacements = computeReplacements(originalLines, path, chunks);
  const newLines = applyReplacements(originalLines, replacements);
  if (newLines.at(-1) !== "") newLines.push("");
  return newLines.join("\n");
}

async function applyHunks(hunks: Hunk[], cwd: string): Promise<{ changes: AppliedChange[]; error?: string }> {
  const changes: AppliedChange[] = [];

  for (const hunk of hunks) {
    try {
      const absolutePath = resolvePatchPath(cwd, hunk.path);
      if (hunk.kind === "add") {
        await ensureParent(absolutePath);
        await writeFile(absolutePath, hunk.contents, "utf8");
        changes.push({ type: "A", path: displayPath(cwd, absolutePath, hunk.path), absolutePath });
      } else if (hunk.kind === "delete") {
        await ensureNotDirectory(absolutePath, "delete file");
        await unlink(absolutePath);
        changes.push({ type: "D", path: displayPath(cwd, absolutePath, hunk.path), absolutePath });
      } else {
        await ensureNotDirectory(absolutePath, "update file");
        const newContents = await deriveNewContents(absolutePath, hunk.chunks);
        if (hunk.movePath) {
          const absoluteMovePath = resolvePatchPath(cwd, hunk.movePath);
          await ensureParent(absoluteMovePath);
          await writeFile(absoluteMovePath, newContents, "utf8");
          await unlink(absolutePath);
          changes.push({
            type: "M",
            path: displayPath(cwd, absoluteMovePath, hunk.movePath),
            absolutePath,
            movePath: displayPath(cwd, absoluteMovePath, hunk.movePath),
            absoluteMovePath,
          });
        } else {
          await writeFile(absolutePath, newContents, "utf8");
          changes.push({ type: "M", path: displayPath(cwd, absolutePath, hunk.path), absolutePath });
        }
      }
    } catch (error) {
      return { changes, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { changes };
}

function summarize(details: ApplyPatchDetails): string {
  const lines = [details.status === "success" ? "Success. Updated the following files:" : "Failed to apply patch."];
  if (details.error) lines.push(`Error: ${details.error}`);
  if (details.partialFailure) lines.push("Partial failure: some earlier changes were already written.");
  for (const change of details.changes) {
    if (change.absoluteMovePath) {
      lines.push(`${change.type} ${change.path} (from ${displayPath(details.cwd, change.absolutePath)})`);
    } else {
      lines.push(`${change.type} ${change.path}`);
    }
  }
  lines.push(`Summary: ${details.totalFiles} files A${details.added} M${details.modified} D${details.deleted}`);
  lines.push(`cwd: ${details.cwd}`);
  return lines.join("\n");
}

function detailsFromChanges(cwd: string, changes: AppliedChange[], error?: string): ApplyPatchDetails {
  const added = changes.filter((change) => change.type === "A").length;
  const modified = changes.filter((change) => change.type === "M").length;
  const deleted = changes.filter((change) => change.type === "D").length;
  return {
    status: error ? "failed" : "success",
    cwd,
    totalFiles: changes.length,
    added,
    modified,
    deleted,
    changes,
    error,
    partialFailure: Boolean(error && changes.length > 0),
  };
}

export default function applyPatchExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "apply_patch",
    label: "apply_patch",
    description: "Apply a patch across one or more files in a single call. Handles add, update, delete, and move across multiple files; absolute paths allowed. Best for cross-file changes where individual edits would be tedious.",
    promptSnippet: "Apply patches across multiple files with add/update/delete/move in one call",
    promptGuidelines: [
      "Use apply_patch when a change spans multiple files — all hunks apply in one tool call instead of N separate edits.",
      "Patch text must start with *** Begin Patch and end with *** End Patch.",
      "This tool can write absolute paths and delete or move files; inspect paths carefully before using it.",
      "This tool is a direct extension-process filesystem writer, not the built-in bash approval flow.",
    ],
    parameters: applyPatchSchema,
    renderShell: "self",
    renderCall(args, theme, context) {
      return renderGroupedToolCall("apply_patch", args, theme, context, summarizeToolCall("apply_patch", args));
    },
    renderResult(result, options, theme, context) {
      if (options.expanded || !canGroupTool(context)) return renderApplyPatchResult(result, options, theme);
      return renderGroupedToolResult("apply_patch", result, options, theme, context);
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let cwd = resolve(ctx.cwd, params.workdir ?? ".");
      let changes: AppliedChange[] = [];
      let error: string | undefined;

      try {
        const parsed = parsePatch(params.patch);
        const result = await applyHunks(parsed.hunks, cwd);
        changes = result.changes;
        error = result.error;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }

      const details = detailsFromChanges(cwd, changes, error);
      return {
        content: [{ type: "text" as const, text: summarize(details) }],
        details,
      };
    },
  });
}
