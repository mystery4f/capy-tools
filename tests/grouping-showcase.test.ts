import { describe, expect, test } from "bun:test";
import { resetBasicToolGroupingForTests, renderGroupedToolCall, renderGroupedToolResult, installBasicToolGrouping, summarizeToolCall } from "../extensions/basic-tool-grouping.ts";

// 一个 passthrough theme，方便看纯文本输出
function plainTheme() {
  return {
    fg: (_name: string, text: string) => text,
    bold: (text: string) => text,
  };
}

function render(component: { render: (width: number) => string[] }, width = 80) {
  return component.render(width).join("\n");
}

function ctx(toolCallId: string, executionStarted = true, expanded = false) {
  return { toolCallId, executionStarted, expanded, invalidate: () => {} };
}

// 模拟一个 tool result
function okResult(text: string, details?: Record<string, any>) {
  return {
    content: [{ type: "text", text }],
    details: details ?? {},
  };
}

describe("grouping showcase - harmless combos", () => {
  test("combo A: 纯 inspect 三连 - read + read_block + symbol_outline", () => {
    resetBasicToolGroupingForTests();
    const theme = plainTheme();

    // 1. read
    const c1 = renderGroupedToolCall("read", { path: "README.md" }, theme, ctx("c1"));
    // 2. read_block
    const c2 = renderGroupedToolCall("read_block", { path: "extensions/basic-tool-grouping.ts", symbol: "renderGroupLines" }, theme, ctx("c2"));
    // 3. symbol_outline
    const c3 = renderGroupedToolCall("symbol_outline", { path: "extensions/basic-tool-grouping.ts", maxBlocks: 4 }, theme, ctx("c3"));

    // 全部成功后看分组标题
    renderGroupedToolResult("read", okResult("# pi-basic-tools\n\nCore tools.\n", { lineCount: 3 }), { expanded: false, isPartial: false }, theme, ctx("c1"));
    renderGroupedToolResult("read_block", okResult("function renderGroupLines(...) { ... }", { displayPath: "extensions/basic-tool-grouping.ts", outputStart: 420, outputEnd: 440 }), { expanded: false, isPartial: false }, theme, ctx("c2"));
    renderGroupedToolResult("symbol_outline", okResult("renderGroupLines\ncodexAction\n...", { displayPath: "extensions/basic-tool-grouping.ts", displayedCount: 4 }), { expanded: false, isPartial: false }, theme, ctx("c3"));

    // 用最后一个 call 的 component 看整组折叠态
    const collapsed = render(c3, 80);
    console.log("\n=== Combo A: 纯 inspect 三连 (collapsed) ===\n" + collapsed);

    expect(collapsed).toContain("Explored 3 targets");
    expect(collapsed).toContain("Read README.md");
    expect(collapsed).toContain("Read extensions/basic-tool-grouping.ts");
    expect(collapsed).toContain("Outline extensions/basic-tool-grouping.ts");
    expect(collapsed).toContain("├ ");
    expect(collapsed).toContain("└ ");
  });

  test("combo B: 纯 search 三连 - grep + find + sourcegraph", () => {
    resetBasicToolGroupingForTests();
    const theme = plainTheme();

    renderGroupedToolCall("grep", { pattern: "BasicToolGroup", path: "extensions" }, theme, ctx("c1"));
    renderGroupedToolCall("find", { pattern: "*.ts", path: "tests" }, theme, ctx("c2"));
    renderGroupedToolCall("sourcegraph", { query: "repo:capyup/pi-basic-tools file:.ts" }, theme, ctx("c3"));

    renderGroupedToolResult("grep", okResult("extensions/basic-tool-grouping.ts:42\nextensions/basic-tool-grouping.ts:88", { lineCount: 2 }), { expanded: false, isPartial: false }, theme, ctx("c1"));
    renderGroupedToolResult("find", okResult("tests/ui-tools.test.ts\ntests/extension-host.ts", { lineCount: 2 }), { expanded: false, isPartial: false }, theme, ctx("c2"));
    renderGroupedToolResult("sourcegraph", okResult("repo_map-read-block.test.ts\napply-patch.test.ts", { lineCount: 2 }), { expanded: false, isPartial: false }, theme, ctx("c3"));

    const collapsed = render(renderGroupedToolCall("sourcegraph", { query: "repo:capyup/pi-basic-tools file:.ts" }, theme, ctx("c3", false)), 80);
    console.log("\n=== Combo B: 纯 search 三连 (collapsed) ===\n" + collapsed);

    expect(collapsed).toContain("Explored 3 targets");
    expect(collapsed).toContain("Search BasicToolGroup");
    expect(collapsed).toContain("Find *.ts");
    expect(collapsed).toContain("Search Sourcegraph repo:capyup/pi-basic-tools file:.ts");
    expect(collapsed).toContain("├ ");
    expect(collapsed).toContain("└ ");
  });

  test("combo C: 混合 inspect + search 五连", () => {
    resetBasicToolGroupingForTests();
    const theme = plainTheme();

    renderGroupedToolCall("repo_map", { path: ".", depth: 2 }, theme, ctx("c1"));
    renderGroupedToolCall("read", { path: "package.json" }, theme, ctx("c2"));
    renderGroupedToolCall("grep", { pattern: "test", path: "tests" }, theme, ctx("c3"));
    renderGroupedToolCall("ls", { path: "extensions" }, theme, ctx("c4"));
    renderGroupedToolCall("read_block", { path: "extensions/basic-tool-grouping.ts", line: 1 }, theme, ctx("c5"));

    renderGroupedToolResult("repo_map", okResult("Root: pi-basic-tools\nFiles: 41", { root: "/Users/lucas/Developer/pi-basic-tools", fileCount: 41 }), { expanded: false, isPartial: false }, theme, ctx("c1"));
    renderGroupedToolResult("read", okResult('{ "name": "@capyup/pi-basic-tools" }', { lineCount: 1 }), { expanded: false, isPartial: false }, theme, ctx("c2"));
    renderGroupedToolResult("grep", okResult("tests/ui-tools.test.ts:10\ntests/ui-tools.test.ts:25", { lineCount: 2 }), { expanded: false, isPartial: false }, theme, ctx("c3"));
    renderGroupedToolResult("ls", okResult("basic-tool-grouping.ts\nindex.ts\n...", { lineCount: 14 }), { expanded: false, isPartial: false }, theme, ctx("c4"));
    renderGroupedToolResult("read_block", okResult("import { ... } from ...", { displayPath: "extensions/basic-tool-grouping.ts", outputStart: 1, outputEnd: 20 }), { expanded: false, isPartial: false }, theme, ctx("c5"));

    const collapsed = render(renderGroupedToolCall("read_block", { path: "extensions/basic-tool-grouping.ts", line: 1 }, theme, ctx("c5", false)), 80);
    console.log("\n=== Combo C: 混合 inspect + search 五连 (collapsed) ===\n" + collapsed);

    expect(collapsed).toContain("Explored 5 targets");
    expect(collapsed).toContain("├ ");
    expect(collapsed).toContain("└ ");
  });

  test("combo D: 同类型纯 run 命令三连（展示 Codex-style）", () => {
    resetBasicToolGroupingForTests();
    const theme = plainTheme();

    renderGroupedToolCall("bash", { command: "git status --short" }, theme, ctx("c1"));
    renderGroupedToolCall("bash", { command: "git log --oneline -3" }, theme, ctx("c2"));
    renderGroupedToolCall("bash", { command: "ls -la" }, theme, ctx("c3"));

    renderGroupedToolResult("bash", okResult(" M README.md\n M extensions/basic-tool-grouping.ts", { lineCount: 2, isError: false }), { expanded: false, isPartial: false }, theme, ctx("c1"));
    renderGroupedToolResult("bash", okResult("a1b2c3d feat: grouping\ne4f5g6h fix: collapse\n", { lineCount: 2, isError: false }), { expanded: false, isPartial: false }, theme, ctx("c2"));
    renderGroupedToolResult("bash", okResult("total 120\ndrwxr-xr-x  14 ...", { lineCount: 3, isError: false }), { expanded: false, isPartial: false }, theme, ctx("c3"));

    const collapsed = render(renderGroupedToolCall("bash", { command: "ls -la" }, theme, ctx("c3", false)), 80);
    console.log("\n=== Combo D: 纯 run 三连 (collapsed) ===\n" + collapsed);

    expect(collapsed).toContain("Ran 3 commands");
    expect(collapsed).toContain("Ran git status --short");
    expect(collapsed).toContain("Ran git log --oneline -3");
    expect(collapsed).toContain("Ran ls -la");
    expect(collapsed).toContain("├ ");
    expect(collapsed).toContain("└ ");
  });

  test("combo E: expanded 态展示完整内容", () => {
    resetBasicToolGroupingForTests();
    const theme = plainTheme();

    renderGroupedToolCall("read", { path: "README.md" }, theme, ctx("c1"));
    renderGroupedToolCall("grep", { pattern: "grouping", path: "extensions" }, theme, ctx("c2"));

    renderGroupedToolResult("read", okResult("# Title\nContent here.\n", { lineCount: 2 }), { expanded: true, isPartial: false }, theme, ctx("c1"));
    renderGroupedToolResult("grep", okResult("extensions/basic-tool-grouping.ts:10\nextensions/basic-tool-grouping.ts:20", { lineCount: 2 }), { expanded: true, isPartial: false }, theme, ctx("c2"));

    const expanded = render(renderGroupedToolCall("grep", { pattern: "grouping", path: "extensions" }, theme, { ...ctx("c2", false), expanded: true }), 80);
    console.log("\n=== Combo E: expanded 态 ===\n" + expanded);

    expect(expanded).toContain("Explored 2 targets");
    // expanded 态下不会有 "to expand" 提示
    expect(expanded).not.toContain("to expand");
    expect(expanded).toContain("├ ");
    expect(expanded).toContain("└ ");
  });

  test("combo F: 单个工具不成组", () => {
    resetBasicToolGroupingForTests();
    const theme = plainTheme();

    renderGroupedToolCall("repo_map", { path: "." }, theme, ctx("c1"));
    renderGroupedToolResult("repo_map", okResult("Files: 10", { root: ".", fileCount: 10 }), { expanded: false, isPartial: false }, theme, ctx("c1"));

    const solo = render(renderGroupedToolCall("repo_map", { path: "." }, theme, ctx("c1", false)), 80);
    console.log("\n=== Combo F: 单个工具（不成组） ===\n" + solo);

    // 单个工具不会显示组标题 "Explored 1 targets"，而是直接显示单行 Codex action
    expect(solo).toContain("Map .");
    // 单个工具不走 tree connector
    expect(solo).not.toContain("├ ");
    expect(solo).not.toContain("└ ");
  });

  test("combo G: error 状态展示", () => {
    resetBasicToolGroupingForTests();
    const theme = plainTheme();

    renderGroupedToolCall("bash", { command: "git invalid-cmd" }, theme, ctx("c1"));
    renderGroupedToolCall("read", { path: "nonexistent-file.xyz" }, theme, ctx("c2"));

    renderGroupedToolResult("bash", { content: [{ type: "text", text: "git: 'invalid-cmd' is not a git command" }], isError: true, details: { lineCount: 1 } }, { expanded: false, isPartial: false }, theme, ctx("c1"));
    renderGroupedToolResult("read", { content: [{ type: "text", text: "Error: ENOENT" }], isError: true, details: { lineCount: 1 } }, { expanded: false, isPartial: false }, theme, ctx("c2"));

    const collapsed = render(renderGroupedToolCall("read", { path: "nonexistent-file.xyz" }, theme, ctx("c2", false)), 80);
    console.log("\n=== Combo G: 含 error 的混合组 ===\n" + collapsed);

    // bash(run) + read(inspect) 混合 role，groupTitle 回退到 "Used N tools"
    expect(collapsed).toContain("Used 2 tools");
    expect(collapsed).toContain("├ ");
    expect(collapsed).toContain("└ ");
    // error glyph from shared visual module
    expect(collapsed).toContain("!");
  });
});
