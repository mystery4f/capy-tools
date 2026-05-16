# Visual System Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the visual hierarchy across `thinking-steps`, `basic-tool-grouping`, and the in-message `todo` renderer using a three-tier color scheme (Tier 1 live = warning/error, Tier 2 structure = muted, Tier 3 detail = muted), and add a per-turn system-prompt injection to raise `todo` tool adoption.

**Architecture:** All in-message group renderers settle to `muted` text in the done state; the only Tier 1 (warning/error) ink is on running group headers, running item markers, and error markers/text. Marker shape (not text color) signals state: `•` for done, `pulseGlyph` (thinking) or static `◐` (tool group) for running, `!` for error. Role glyphs in thinking-steps lose their semantic color and render in muted (shape carries the meaning). Active thinking-step text drops its accent but keeps `bold`. Todo extension gains a `before_agent_start` system-prompt injection identical in shape to the existing `work_checkpoint` injection, contributing four todo-discipline rules.

**Tech Stack:** TypeScript / `@earendil-works/pi-coding-agent` extension API / `@earendil-works/pi-tui` / `bun test`. Existing patterns: `extensions/work-checkpoint.ts` for `before_agent_start` injection, `tests/extension-host.ts` `handlers` map for testing the injection.

---

## File Structure

**Modified files:**
- `extensions/thinking-steps/render.ts` — `roleColor`, `renderGroupHeader.titleColor`, `renderCollapsed` label color + glyph color, `stepStyle` active branch.
- `extensions/basic-tool-grouping.ts` — `wrapActionLine.headlineRole`, `formatCompactItem.marker`.
- `extensions/todo/render.ts` — `renderStandaloneCall`, `renderStandaloneResult` colors.
- `extensions/todo/index.ts` — register `before_agent_start` handler with `TODO_SYSTEM_PROMPT`.
- `tests/thinking-steps.test.ts` — assert muted role glyphs, muted done header, muted active step text + bold + warning marker.
- `tests/repo-map-read-block.test.ts` — assert muted tool-item text; warning `◐` marker on running; `!` on error.
- `tests/grouping-showcase.test.ts` — refresh showcase color expectations.
- `tests/todo.test.ts` — assert muted standalone-fallback colors; assert four todo rules in injection.
- `tests/ui-tools.test.ts` — assert `work_checkpoint` and `todo` injections both register on `before_agent_start` and the `todo` injection contains its key phrases.

**No new files.** The spec deliberately avoided introducing `extensions/spinner.ts`.

---

## Task 1: Thinking-steps role glyphs lose their color

**Files:**
- Modify: `extensions/thinking-steps/render.ts:42-53` (the `roleColor` function)
- Modify: `extensions/thinking-steps/render.ts:144` and `:342` (call sites passing `roleColor(step.role)`)
- Test: `tests/thinking-steps.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe("thinking-steps parse + render", () => { ... })` block in `tests/thinking-steps.test.ts`. Use the existing `renderThinkingStepsLines` export (already imported at line 4 of the file) — no new exports needed.

```ts
test("role glyphs render in muted color regardless of role", () => {
  const blocks = makeBlocks(
    "I need to compare the new and old renderers carefully.",       // role: compare
    "Let me inspect the existing implementation to understand it.",  // role: inspect
    "I'll verify the fix works against a real capture.",            // role: verify
  );
  const steps = deriveThinkingSteps(blocks);
  const lines = renderThinkingStepsLines(taggingTheme, 200, {
    mode: "summary",
    steps,
    activeStepId: undefined,
    isActive: false,
  });
  const stepRows = lines.filter((line) => line.includes("• "));
  expect(stepRows.length).toBeGreaterThanOrEqual(3);
  // Role glyphs from roleGlyph(): ◫ ⌕ ↔ ✓ ✎ ◇ ! ·
  const NON_MUTED_GLYPH = /<(warning|accent|success|error|mdLink)>[◫⌕↔✓✎◇!·]<\/(warning|accent|success|error|mdLink)>/;
  const MUTED_GLYPH = /<muted>[◫⌕↔✓✎◇!·]<\/muted>/;
  for (const row of stepRows) {
    expect(row).not.toMatch(NON_MUTED_GLYPH);
    expect(row).toMatch(MUTED_GLYPH);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/thinking-steps.test.ts -t "role glyphs render in muted"`
Expected: FAIL with a `<warning>…</warning>` or `<accent>…</accent>` match showing the current colored glyph.

- [ ] **Step 3: Replace `roleColor` body so all roles return `"muted"`**

Edit `extensions/thinking-steps/render.ts:42-53` to:

```ts
function roleColor(_role: ThinkingSemanticRole): string {
  // The role glyph shape (set by roleGlyph) carries the semantic meaning;
  // color belongs to the unified tier system, which keeps detail content
  // muted regardless of role. See specs/2026-05-16-visual-system-unification.
  return "muted";
}
```

(Do not delete the function. Two call sites — line 144 and line 342 — pass the role through it; leaving the function in place keeps the call sites identical and makes the diff one block.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/thinking-steps.test.ts -t "role glyphs render in muted"`
Expected: PASS.

- [ ] **Step 5: Run the full file to catch regressions**

Run: `bun test tests/thinking-steps.test.ts`
Expected: All tests pass. If any existing test asserts a specific role color, update its expectation to muted as part of this step (do not just delete the assertion — record what was changed).

- [ ] **Step 6: Commit**

```bash
git add extensions/thinking-steps/render.ts tests/thinking-steps.test.ts
git commit -m "thinking-steps: drop role-color, render all role glyphs muted"
```

---

## Task 2: Thinking-steps done header turns muted

**Files:**
- Modify: `extensions/thinking-steps/render.ts:322` (`renderGroupHeader`) — done titleColor accent → muted
- Modify: `extensions/thinking-steps/render.ts:340` (`renderCollapsed`) — done label color accent → muted
- Test: `tests/thinking-steps.test.ts`

- [ ] **Step 1: Write the failing test**

Add these tests to `tests/thinking-steps.test.ts` next to the existing "summary mode renders a Codex-style header" test. Use the already-exported `renderThinkingStepsLines` and switch `mode` between `"summary"` and `"collapsed"`:

```ts
test("done Thinking N steps header (summary mode) uses muted color (not accent)", () => {
  const steps = deriveThinkingSteps(sampleBlocks);
  const lines = renderThinkingStepsLines(taggingTheme, 200, {
    mode: "summary",
    steps,
    activeStepId: undefined,
    isActive: false,
  });
  expect(lines[0]).toContain("<muted>Thinking</muted>");
  expect(lines[0]).not.toContain("<accent>Thinking</accent>");
});

test("active Thinking N steps header (summary mode) stays warning", () => {
  const steps = deriveThinkingSteps(sampleBlocks);
  const lines = renderThinkingStepsLines(taggingTheme, 200, {
    mode: "summary",
    steps,
    activeStepId: steps[0]!.id,
    isActive: true,
  });
  expect(lines[0]).toContain("<warning>Thinking</warning>");
});

test("done collapsed Thinking label uses muted (not accent)", () => {
  const steps = deriveThinkingSteps(sampleBlocks);
  const lines = renderThinkingStepsLines(taggingTheme, 200, {
    mode: "collapsed",
    steps,
    activeStepId: undefined,
    isActive: false,
    nowMs: 0,
  });
  expect(lines[0]).toContain("<muted>Thinking</muted>");
  expect(lines[0]).not.toContain("<accent>Thinking</accent>");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/thinking-steps.test.ts -t "done Thinking"`
Expected: FAIL with `<accent>Thinking</accent>` showing up where `<muted>Thinking</muted>` is expected.

- [ ] **Step 3: Change the done-state colors**

Edit `extensions/thinking-steps/render.ts:322`:

```ts
  const titleColor = isActive ? "warning" : "muted";
```

Edit `extensions/thinking-steps/render.ts:340`:

```ts
  const label = theme.fg(isActive ? "warning" : "muted", "Thinking");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/thinking-steps.test.ts -t "done Thinking"` and `bun test tests/thinking-steps.test.ts -t "active Thinking"` and `bun test tests/thinking-steps.test.ts -t "collapsed Thinking"`
Expected: All three pass.

- [ ] **Step 5: Re-run the full file**

Run: `bun test tests/thinking-steps.test.ts`
Expected: All tests pass. Update any earlier assertion that hard-coded `<accent>Thinking</accent>` to `<muted>Thinking</muted>` and document the change inline.

- [ ] **Step 6: Commit**

```bash
git add extensions/thinking-steps/render.ts tests/thinking-steps.test.ts
git commit -m "thinking-steps: done-state Thinking header renders muted"
```

---

## Task 3: Thinking-steps active step text turns muted (bold + warning marker preserved)

**Files:**
- Modify: `extensions/thinking-steps/render.ts:119-130` (the `stepStyle` function)
- Test: `tests/thinking-steps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("active thinking step uses warning marker + muted text + bold (no accent)", () => {
  const blocks = makeBlocks("Investigating the renderer right now to find the bug.");
  const steps = deriveThinkingSteps(blocks);
  const activeId = steps[0]!.id;
  const lines = renderThinkingStepsLines(taggingTheme, 200, {
    mode: "summary",
    steps,
    activeStepId: activeId,
    isActive: true,
  });
  const stepRow = lines.find((line) => line.includes("• ")) ?? "";
  // Marker must be warning.
  expect(stepRow).toMatch(/<warning>•<\/warning>/);
  // Summary text must be wrapped by <muted> and <b>, not <accent>.
  expect(stepRow).toMatch(/<b><muted>[^<]*<\/muted><\/b>/);
  expect(stepRow).not.toMatch(/<accent>[^<]+<\/accent>/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/thinking-steps.test.ts -t "active thinking step uses warning marker"`
Expected: FAIL — current implementation emits `<accent>` around the summary text.

- [ ] **Step 3: Update `stepStyle` active branch**

Edit `extensions/thinking-steps/render.ts:119-122`:

```ts
function stepStyle(step: DerivedThinkingStep, active: boolean): StepStyle {
  if (active) {
    // Tier 1 signal (warning) lives on the marker; the summary text stays Tier 3 (muted).
    // Bold is kept as a weight cue that the line is still being written.
    return { markerColor: "warning", summaryColor: "muted", bold: true };
  }
```

(Rest of the function is unchanged.)

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/thinking-steps.test.ts -t "active thinking step uses warning marker"`
Expected: PASS.

- [ ] **Step 5: Re-run the full file**

Run: `bun test tests/thinking-steps.test.ts`
Expected: All pass. Update existing assertions that expect `<accent>` on the active summary text to `<muted>` (and bold).

- [ ] **Step 6: Commit**

```bash
git add extensions/thinking-steps/render.ts tests/thinking-steps.test.ts
git commit -m "thinking-steps: active step text muted + bold (warning marker)"
```

---

## Task 4: Basic-tool-grouping item text turns muted

**Files:**
- Modify: `extensions/basic-tool-grouping.ts:302-319` (the `wrapActionLine` function — only the `headlineRole` constant)
- Test: `tests/repo-map-read-block.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/repo-map-read-block.test.ts` currently has a `plainTheme()` helper (line 21) that returns text unchanged. Add a sibling `taggingTheme()` helper at the top of the file so colors are visible in assertions:

```ts
function taggingTheme() {
  return {
    fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
    bold: (text: string) => `<b>${text}</b>`,
  };
}
```

Then add this test inside the existing `describe("enable-builtin-search", () => { ... })` block (the same block that already covers grouping behavior — see line 377 for the established pattern):

```ts
test("done basic-tool item line renders headline text in muted (not accent)", async () => {
  const enableBuiltinSearchExtension = (await import("../extensions/enable-builtin-search.ts")).default;
  const { resetBasicToolGroupingForTests } = await import("../extensions/basic-tool-grouping.ts");
  resetBasicToolGroupingForTests();

  const allTools = ["read", "bash", "edit", "write", "grep", "find", "ls"].map(builtinTool);
  const host = createExtensionHost({ activeTools: ["read", "bash", "edit", "write"], allTools });
  enableBuiltinSearchExtension(host.api as any);

  const bash = host.getTool("bash");
  const context = { toolCallId: "bash-color", executionStarted: true, expanded: false, invalidate() {} };
  const component = bash.renderCall({ command: "git status" }, taggingTheme(), context);
  // Drive the item to the `success` (done) state by emitting a successful result.
  bash.renderResult({ content: [{ type: "text", text: "" }] }, { expanded: false, isPartial: false }, taggingTheme(), context);

  const rendered = renderComponent(component);
  expect(rendered).toContain("<muted>Ran git status</muted>");
  expect(rendered).not.toContain("<accent>Ran git status</accent>");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/repo-map-read-block.test.ts -t "done basic-tool item line renders text in muted"`
Expected: FAIL — current code wraps the text in `<accent>`.

- [ ] **Step 3: Change `headlineRole` to drop accent**

Edit `extensions/basic-tool-grouping.ts:304`:

```ts
  const headlineRole = item.status === "error" ? "error" : "muted";
```

(Removes both the `running → warning` and the implicit `done → accent` branches. Running color now comes from the marker rule in Task 5 — the text always stays muted unless errored.)

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/repo-map-read-block.test.ts -t "done basic-tool item line renders text in muted"`
Expected: PASS.

- [ ] **Step 5: Run the full file**

Run: `bun test tests/repo-map-read-block.test.ts`
Expected: All pass. Update any existing assertion that expected `<accent>Ran …</accent>` to `<muted>Ran …</muted>`. If a test asserted `<warning>` around the running-item text, change to `<muted>` and rely on the marker assertion (added in Task 5) for the running signal.

- [ ] **Step 6: Commit**

```bash
git add extensions/basic-tool-grouping.ts tests/repo-map-read-block.test.ts
git commit -m "basic-tool-grouping: item text always muted (errors stay error)"
```

---

## Task 5: Basic-tool-grouping marker becomes shape-based for running and error

**Files:**
- Modify: `extensions/basic-tool-grouping.ts:321-325` (the `formatCompactItem` function)
- Test: `tests/repo-map-read-block.test.ts`

- [ ] **Step 1: Write the failing tests**

Add two tests inside the same `describe("enable-builtin-search", ...)` block, reusing the `taggingTheme()` helper from Task 4:

```ts
test("running basic-tool item uses warning ◐ marker with muted headline text", async () => {
  const enableBuiltinSearchExtension = (await import("../extensions/enable-builtin-search.ts")).default;
  const { resetBasicToolGroupingForTests } = await import("../extensions/basic-tool-grouping.ts");
  resetBasicToolGroupingForTests();

  const allTools = ["read", "bash", "edit", "write", "grep", "find", "ls"].map(builtinTool);
  const host = createExtensionHost({ activeTools: ["read", "bash", "edit", "write"], allTools });
  enableBuiltinSearchExtension(host.api as any);

  const bash = host.getTool("bash");
  // `executionStarted: true` sets status to `running`; no renderResult yet.
  const context = { toolCallId: "bash-running", executionStarted: true, expanded: false, invalidate() {} };
  const component = bash.renderCall({ command: "sleep 10" }, taggingTheme(), context);
  const rendered = renderComponent(component);

  // Marker: warning-wrapped rounded glyph.
  expect(rendered).toContain("<warning>◐</warning>");
  // Headline text: muted.
  expect(rendered).toMatch(/<muted>Ran [^<]+<\/muted>/);
  // No accent in the running line.
  expect(rendered).not.toContain("<accent>");
});

test("errored basic-tool item uses error ! marker and error-colored headline text", async () => {
  const enableBuiltinSearchExtension = (await import("../extensions/enable-builtin-search.ts")).default;
  const { resetBasicToolGroupingForTests } = await import("../extensions/basic-tool-grouping.ts");
  resetBasicToolGroupingForTests();

  const allTools = ["read", "bash", "edit", "write", "grep", "find", "ls"].map(builtinTool);
  const host = createExtensionHost({ activeTools: ["read", "bash", "edit", "write"], allTools });
  enableBuiltinSearchExtension(host.api as any);

  const bash = host.getTool("bash");
  const context = { toolCallId: "bash-error", executionStarted: true, expanded: false, invalidate() {} };
  const component = bash.renderCall({ command: "false" }, taggingTheme(), context);
  // Emit a failing result so status transitions to `error` (see renderGroupedToolResult).
  bash.renderResult({ content: [{ type: "text", text: "" }], isError: true }, { expanded: false, isPartial: false }, taggingTheme(), context);

  const rendered = renderComponent(component);
  expect(rendered).toContain("<error>!</error>");
  expect(rendered).toMatch(/<error>Ran [^<]+<\/error>/);
});
```

- [ ] **Step 2: Run to verify failures**

Run: `bun test tests/repo-map-read-block.test.ts -t "running basic-tool item"` and `bun test tests/repo-map-read-block.test.ts -t "errored basic-tool item"`
Expected: Both FAIL — current code emits `•` for running and `!` already exists for error but text wrapping may differ.

- [ ] **Step 3: Update `formatCompactItem`**

Replace `extensions/basic-tool-grouping.ts:321-325`:

```ts
function formatCompactItem(item: ToolItem, theme: any, width: number): string[] {
  const headline = actionHeadline(item);
  // Marker shape encodes state so item text can stay muted in all non-error cases:
  //   running -> warning ◐  (static rounded glyph, no per-tick redraw)
  //   error   -> error   !
  //   done    -> muted   •
  let marker: string;
  if (item.status === "error") marker = "!";
  else if (item.status === "running" || item.status === "pending") marker = "◐";
  else marker = "•";
  return wrapActionLine(marker, headline, theme, item, width);
}
```

Also re-check `wrapActionLine` (line 305): the marker color is set there via `theme.fg(statusColor, marker)` where `statusColor` comes from `statusRole(item)` — which already returns `error/success/warning/muted`. The new marker glyph will be wrapped correctly by the existing color logic. Confirm by reading `statusRole` (lines 215-220): error→error, success→success, running→warning, default→muted. This matches the tier rules; no further change needed.

If `statusRole` returns `success` for done items, the marker will be wrapped in `<success>…</success>` — that violates the spec's "done marker is muted" rule. Patch `statusRole`:

```ts
function statusRole(item: ToolItem): string {
  if (item.status === "error") return "error";
  if (item.status === "running" || item.status === "pending") return "warning";
  return "muted"; // done state, including success — Tier 2.
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test tests/repo-map-read-block.test.ts -t "running basic-tool item"` and `bun test tests/repo-map-read-block.test.ts -t "errored basic-tool item"`
Expected: Both PASS.

- [ ] **Step 5: Run the full file**

Run: `bun test tests/repo-map-read-block.test.ts`
Expected: All pass. Refresh any `<success>` marker assertions to `<muted>`.

- [ ] **Step 6: Run grouping-showcase**

Run: `bun test tests/grouping-showcase.test.ts`
Expected: Pass after assertion refresh. If snapshots include the old `<accent>` / `<success>` / `•` running marker, update them — record each change in the commit body.

- [ ] **Step 7: Commit**

```bash
git add extensions/basic-tool-grouping.ts tests/repo-map-read-block.test.ts tests/grouping-showcase.test.ts
git commit -m "basic-tool-grouping: shape-based markers (◐ running, ! error, • done)"
```

---

## Task 6: Todo standalone-fallback renderer drops accent

**Files:**
- Modify: `extensions/todo/render.ts:151` (`renderStandaloneCall`)
- Modify: `extensions/todo/render.ts:159` (`renderStandaloneResult`)
- Test: `tests/todo.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/todo.test.ts` inside the `describe("todo render — per-call single-line + grouping", () => { ... })` block (or a sibling block, whichever fits the file's organization):

```ts
test("standalone fallback renders verbs/subjects in muted (not accent)", () => {
  // Call renderStandaloneCall / renderStandaloneResult directly via the exported
  // `renderTodoCall` entry point — when basic-tool-grouping context is missing
  // the entry point falls back to the standalone path. Use a tagging theme.
  const tagging = {
    fg(color: string, text: string) { return `<${color}>${text}</${color}>`; },
    bold(text: string) { return text; },
  };
  // Render a `create` call standalone (no grouping context).
  const callOutput = renderTodoCall(
    { action: "create", subject: "Draft the README" } as any,
    tagging as any,
    /* context */ undefined,
    /* state */ { tasks: [], nextId: 1 } as any,
  );
  const callText = callOutput.render?.(200).join("\n") ?? String(callOutput);
  expect(callText).toContain("<muted>");
  expect(callText).not.toContain("<accent>");

  const resultOutput = renderTodoResult(
    { action: "create", subject: "Draft the README" } as any,
    { content: [{ type: "text", text: "" }], details: { kind: "create", taskId: 1 } } as any,
    { expanded: false, isPartial: false } as any,
    tagging as any,
    /* context */ undefined,
    /* state */ { tasks: [{ id: 1, subject: "Draft the README", status: "pending" }], nextId: 2 } as any,
  );
  const resultText = resultOutput.render?.(200).join("\n") ?? String(resultOutput);
  expect(resultText).toContain("<muted>");
  expect(resultText).not.toContain("<accent>");
});
```

If `renderTodoCall` / `renderTodoResult` insist on a real grouping context to route correctly, pass `undefined` for `context` — that is precisely the fallback path the standalone functions cover.

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/todo.test.ts -t "standalone fallback renders verbs"`
Expected: FAIL — current code wraps verb/subject text in `<accent>`.

- [ ] **Step 3: Update the standalone functions**

Edit `extensions/todo/render.ts:151`:

```ts
  return new Text(theme.fg("muted", `${verb}${target}`), 0, 0);
```

Edit `extensions/todo/render.ts:159`:

```ts
  const headlineColor = (result as { isError?: boolean }).isError ? "error" : "muted";
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/todo.test.ts -t "standalone fallback renders verbs"`
Expected: PASS.

- [ ] **Step 5: Run the full file**

Run: `bun test tests/todo.test.ts`
Expected: All pass. Update any existing assertion that expected the standalone fallback to emit `accent`.

- [ ] **Step 6: Commit**

```bash
git add extensions/todo/render.ts tests/todo.test.ts
git commit -m "todo: standalone fallback renders text muted (errors stay error)"
```

---

## Task 7: Add todo system-prompt injection

**Files:**
- Modify: `extensions/todo/index.ts` (add `TODO_SYSTEM_PROMPT` constant + `pi.on("before_agent_start", ...)`)
- Test: `tests/todo.test.ts`, `tests/ui-tools.test.ts`

- [ ] **Step 1: Write the failing test (todo.test.ts)**

Add this test to `tests/todo.test.ts`. It mirrors the work_checkpoint injection test in `tests/ui-tools.test.ts:213-231`:

```ts
test("injects a todo discipline section into each agent turn", async () => {
  const host = createExtensionHost();
  todoExtension(host.api as any);
  const handlers = host.handlers.get("before_agent_start") ?? [];

  expect(handlers.length).toBe(1);
  const result = await handlers[0]({});

  // Four rules from the spec must all appear in the injected systemPrompt.
  expect(result.systemPrompt).toContain("Todo discipline:"); // section heading
  expect(result.systemPrompt).toContain("3+ steps");
  expect(result.systemPrompt).toContain("multi-task list");
  expect(result.systemPrompt).toContain("not yet captured");
  expect(result.systemPrompt).toContain("Skip it for single trivial requests");
  expect(result.systemPrompt).toContain("purely conversational");
  expect(result.systemPrompt).toContain("mark it `in_progress`");
  expect(result.systemPrompt).toContain("mark it `completed`");
  expect(result.systemPrompt).toContain("never batch completions");
  expect(result.systemPrompt).toContain("Exactly one task is `in_progress` at a time");
});
```

You will likely need to import `createExtensionHost` at the top of `tests/todo.test.ts` (mirroring how `tests/ui-tools.test.ts` does it). Also import `todoExtension from "../extensions/todo/index.ts"`.

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/todo.test.ts -t "injects a todo discipline section"`
Expected: FAIL — `handlers.length` is `0` because no handler is registered yet.

- [ ] **Step 3: Add the constant + handler registration**

Edit `extensions/todo/index.ts`. Add this constant near the top (after the `PROMPT_GUIDELINES` array, around line 50):

```ts
const TODO_SYSTEM_PROMPT = [
  "Todo discipline:",
  "Use the `todo` tool immediately when the user gives you 3+ steps, a multi-task list, or any new set of instructions not yet captured.",
  "Skip it for single trivial requests and purely conversational turns.",
  "Before starting a task, mark it `in_progress`. The moment a task is done, mark it `completed` — never batch completions.",
  "Exactly one task is `in_progress` at a time.",
].join("\n");
```

Inside the `todoExtension` function, after the `registerTool` block and before the existing `pi.on("session_start", ...)` handler (so injection runs before session lifecycle events on every turn), add:

```ts
  pi.on("before_agent_start", () => ({ systemPrompt: TODO_SYSTEM_PROMPT }));
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/todo.test.ts -t "injects a todo discipline section"`
Expected: PASS.

- [ ] **Step 5: Write the co-existence test (ui-tools.test.ts)**

Append this test to `tests/ui-tools.test.ts` (after the existing `work_checkpoint` describe block, in a new `describe("work_checkpoint + todo injection co-existence", ...)`):

```ts
import todoExtension from "../extensions/todo/index.ts";

describe("work_checkpoint + todo injection co-existence", () => {
  test("both extensions register a before_agent_start handler that contributes a systemPrompt", async () => {
    const host = createExtensionHost();
    workCheckpointExtension(host.api as any);
    todoExtension(host.api as any);
    const handlers = host.handlers.get("before_agent_start") ?? [];
    expect(handlers.length).toBe(2);

    const prompts = await Promise.all(handlers.map((h) => h({}).then((r: any) => r.systemPrompt)));
    // One handler contributes the checkpoint discipline, the other the todo discipline.
    const checkpointPrompt = prompts.find((p) => p.includes("checkpoint block"));
    const todoPrompt = prompts.find((p) => p.includes("Todo discipline:"));
    expect(checkpointPrompt).toBeDefined();
    expect(todoPrompt).toBeDefined();
    // The two injections are independent strings, not concatenated.
    expect(checkpointPrompt).not.toContain("Todo discipline:");
    expect(todoPrompt).not.toContain("checkpoint block");
  });
});
```

- [ ] **Step 6: Run the co-existence test**

Run: `bun test tests/ui-tools.test.ts -t "before_agent_start handler that contributes"`
Expected: PASS (both extensions are now registered and independently contribute).

- [ ] **Step 7: Commit**

```bash
git add extensions/todo/index.ts tests/todo.test.ts tests/ui-tools.test.ts
git commit -m "todo: inject per-turn discipline rules into system prompt"
```

---

## Task 8: Full test suite + real-Pi TUI capture validation

**Files:** None modified. This is a verification gate before declaring the feature done.

- [ ] **Step 1: Run the full bun test suite**

Run: `npm run check`
Expected: All tests pass (including build check). If any test outside the files above fails, investigate before continuing — most likely a snapshot drift.

- [ ] **Step 2: Run the isolated TUI capture**

Run: `npm run test:tui-capture`
Expected: Capture saved under `.pi/tui-captures/<timestamp>/plain.txt`. Open the file and verify by eye:
- `Thinking N steps` header appears in muted (no bright accent).
- `Ran N commands` / `Explored N targets` / `Used N tools` headers also muted.
- Individual `• Ran git status …` / `• Read foo.ts` rows render as muted text.
- If something is running during capture, the running header is warning and the running item shows `◐` in warning.
- No item line outside of error states shows accent.

- [ ] **Step 3: Run the current-settings TUI capture**

Run: `npm run test:tui-capture:current`
Expected: Capture saved under `.pi/tui-captures/<timestamp>/plain.txt`. Same visual checks as Step 2 but loaded through the user's normal settings path.

- [ ] **Step 4: Add a milestone note**

Append a milestone entry to `specs/2026-05-15-persistent-terminal-session/MILESTONES.md` (this is the project's existing rolling log; the visual-system-unification spec lives separately but milestone notes still accumulate here per house style). Format follows the existing `### YYYY-MM-DD HH:MM:SS - <title>` pattern. Summarize: tier rules now uniform; thinking + tool group + todo standalone renderers all use muted detail text; `◐` marker introduced for running tool items; todo system-prompt injection live and co-exists with work_checkpoint.

- [ ] **Step 5: Commit the milestone note**

```bash
git add specs/2026-05-15-persistent-terminal-session/MILESTONES.md
git commit -m "milestone: visual system unification + todo injection complete"
```

---

## Notes on edge cases (read once before starting)

- **Test files that drive the grouping extension** likely use an event-feeding harness (`tool_execution_start`, `tool_execution_end`, `message_update`). Tasks 4 and 5 reuse that harness — do not invent a new one.
- **`taggingTheme` width** caveat (already in `tests/thinking-steps.test.ts:29-38`): only use it for color-assertion tests where the input is short enough to fit on one line. For width-sensitive tests, use the `widthSafeTheme`.
- **`renderTodoCall` / `renderTodoResult`** are the public entry points; the standalone functions (`renderStandaloneCall`, `renderStandaloneResult`) are internal and only activate when grouping context is missing. Task 6 exercises the standalone path through the public entry point by passing `undefined` for context.
- **Bold-on-muted in real terminals**: `theme.bold(theme.fg("muted", ...))` produces a bold-muted string in most terminal themes. If a particular theme renders bold-muted as a different color than non-bold-muted, accept the inconsistency — the spec lists this in Risks.
- **Marker color comes from `statusRole`**, not from a literal in `formatCompactItem`. Task 5 patches `statusRole` so done items return `muted` (Tier 2) — this is the most subtle change in the plan; without it, the new `•` marker would be wrapped in `<success>` and violate the tier rules. Do not skip the `statusRole` edit in Task 5 Step 3.
