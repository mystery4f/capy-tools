# Capy Tools

Capy Tools is a capybara-flavoured toolkit for pi. The npm package remains `@capyup/pi-basic-tools` for compatibility, but the plugin/repo brand is Capy Tools.

This package bundles a practical set of editing, fetch, web-reference, compact basic-tool UI, todo, proactive auto-compaction, command history, custom model effort controls, Codex-style goals, RTK command-output compression, working-message, and built-in search activation extensions split out from `pi-goodstuff` and related standalone packages.

## Included extensions

- `fetch`
- `enable-builtin-search` (activates pi's built-in `grep`, `find`, and `ls` tools)
- `repo-map` (`repo_map` tool)
- `read-block` (`read_block` tool)
- `symbol-outline` (`symbol_outline` tool)
- `apply-patch` (`apply_patch` tool)
- `terminal-session` (`exec_command` and `write_stdin` tools)
- `ask-user` (`ask_user` tool)
- `ask-question` (`ask_question` tool)
- `ask-questionnaire` (`ask_questionnaire` tool)
- `sourcegraph`
- `recap` (`recap` tool)
- `thinking-steps` (passive renderer for chain-of-thought blocks; no user-facing controls)
- `todo` (forked task-tracking tool with a compact above-editor overlay; replays state across `/reload` and compaction)
- `auto-compact` (forked proactive pre-turn/mid-turn context compaction, configured through `/capy-tools-settings`)
- `command-history` (folder-scoped persistent input history on `ctrl+up` / `ctrl+down`)
- `codex-fast` (`/codex-fast` and `--fast` priority `service_tier` injection for OpenAI/OpenAI Codex)
- `efforts` (custom model-specific thinking/effort labels and payload rewrites)
- `codex-goal` (`/goal`, `get_goal`, `create_goal`, and `update_goal` long-running goal tracking)
- `rtk` (`/rtk`, bash auto-rewrite, and skill for Rust Token Killer output compression)
- `working-message` (forked calm animal-life working-message renderer with a four-language `/capy-tools-settings` panel)

## Usage reference

This section is the user-facing manual for the components bundled inside Capy Tools. The short version: install one package, then use the tools/commands below; most UI components run passively once the extension is loaded.

### User commands and shortcuts

| Surface | Usage | What it does | Persisted state |
|---|---|---|---|
| `/capy-tools-settings` | Open the settings menu | Edits working-message language, auto-compact threshold/strategy, and Codex fast mode | `~/.pi/agent/capy-tools.json` |
| `/capy-tools-settings status` | Show auto-compact status | Reports current context tokens, threshold, strategy, and pending compaction state | none |
| `/capy-tools-settings reset-auto-compact` | Reset compaction defaults | Keeps working-message language and resets only `autoCompact` | `~/.pi/agent/capy-tools.json` |
| `/capy-tools-settings en` / `zh` / `ja` / `ko` | Set working-message language | Also accepts English/Chinese/Japanese/Korean labels | `workingMessage.language` |
| `/capy-tools-settings codex-fast on` / `off` / `toggle` / `status` | Control priority service tier | Mirrors `/codex-fast` but lives under the unified settings surface | `codexFast.enabled` |
| `/codex-fast` | Toggle OpenAI/OpenAI Codex fast mode | Adds `service_tier: "priority"` to supported provider payloads when enabled | `codexFast.enabled` |
| `pi --fast` | Start with fast mode enabled | One-shot startup flag; persisted state is still controlled by the toggle | `codexFast.enabled` when toggled |
| `/efforts-reload` | Reload effort config | Re-reads `~/.pi/effort_levels.json` without restarting pi | none |
| `/goal` | Show current goal | Reports objective, status, elapsed active time, tokens used, and hints | session custom entries |
| `/goal <objective>` | Start/replace a goal | Queues a hidden follow-up turn so the agent keeps working toward the goal | session custom entries |
| `/goal pause` / `resume` / `clear` | Manage goal state | Resume queues a hidden follow-up turn when the goal can continue | session custom entries |
| `/rtk` | Show `rtk gain` | Runs `rtk gain` and renders output in a transient widget | none |
| `/rtk <args>` | Run an rtk meta command | Examples: `/rtk gain --history`, `/rtk discover`, `/rtk session` | none |
| `/rtk on` / `off` / `status` / `clear` | Control RTK for this session | Enables/disables bash rewriting, reports state, or hides the widget | session memory only |
| `ctrl+up` / `ctrl+down` | Recall submitted input | Walks folder-scoped command history in the editor | `~/.pi/folder-history/*.jsonl` |
| `Ctrl+T` | Native pi thinking-level selector | Shows any custom efforts configured for the current provider/model | pi + `~/.pi/effort_levels.state.json` |

### Model-callable tools

These are the tools the agent can call. They appear in the model's tool list and are also useful when debugging agent behavior.

| Tool | Primary use | Typical arguments / notes |
|---|---|---|
| `repo_map` | Quickly orient in a project | `path`, `depth`, `maxFiles`, `maxRecent`; includes git state, manifests, language mix, and representative files |
| `read_block` | Read one semantic block | Use `path` + `symbol` or `line`; modes: `auto`, `markdown`, `indentation`, `window` |
| `symbol_outline` | List readable anchors in a file | Good first step before `read_block`; supports Markdown, code, and CSS-ish structures |
| `apply_patch` | Apply Codex-style patches | Accepts `*** Begin Patch` envelopes; can add/update/move/delete files; writes directly from the extension process |
| `exec_command` | Start persistent shell work | Returns `exit_code` if complete or `session_id` if still running; non-PTY process shell |
| `write_stdin` | Interact with `exec_command` sessions | Poll with empty `chars`, interrupt with `"\u0003"`, or send input to a running process |
| `ask_user` | Ask one free-form user question | Use when the agent needs an unstructured answer before continuing |
| `ask_question` | Ask one focused question | Supports suggested options plus free-text fallback |
| `ask_questionnaire` | Ask several related questions | Supports recommended choices, review/submit flow, and custom answers |
| `fetch` | Fetch a URL and store artifacts | Saves raw response + Markdown under `.pi/fetch/`; returns the file path the agent should read next |
| `sourcegraph` | Search public code/docs | Uses Sourcegraph API for examples, symbols, and reference implementations |
| `read` | Read files | Pi built-in; Capy Tools keeps it active and renders it inside grouped inspect blocks |
| `bash` | Run shell commands | Pi built-in; Capy Tools groups command rows and RTK can rewrite this tool's command before execution |
| `grep` / `find` / `ls` | Search and inspect the filesystem | Pi built-ins activated by `enable-builtin-search`; rendered as compact search/inspect rows |
| `edit` / `write` | Modify files through pi built-ins | Capy Tools keeps their previews fully expanded instead of folding behind `ctrl+o` |
| `recap` | Render a visible progress/preamble line | Single `text` argument; rendered once as italic prose; intentionally separates tool groups |
| `todo` | Track multi-step work | Actions: `create`, `update`, `list`, `get`, `delete`, `clear`; powers the above-editor todo overlay |
| `get_goal` | Inspect current long-running goal | Returns objective, status, token budget, tokens used, and elapsed time |
| `create_goal` | Start a tracked goal from model side | Takes `objective` and optional `token_budget`; fails if a goal already exists |
| `update_goal` | Mark current goal complete | Only accepts `status: "complete"`; intended after an evidence-backed completion audit |

### Passive UI and runtime components

| Component | What you see | How it behaves |
|---|---|---|
| `enable-builtin-search` | Built-in `grep`, `find`, `ls` become available | Removes legacy custom search shadows and prefers pi's managed `rg` / `fd` helpers |
| `basic-tool-grouping` | `Explored N targets`, `Ran N commands`, compact tool rows | Groups consecutive basic tool calls, splits on non-basic tools, and keeps full `write`/`edit` previews expanded |
| `thinking-steps` | `Thinking Steps · N thoughts` card | Passive renderer for thinking blocks; no command, shortcut, or config |
| `todo` overlay | `Todos N/M` above the editor | Replays state across reload/compaction/tree fork and shows exactly one active task when the agent follows the discipline |
| `auto-compact` | Optional notification/follow-up when compaction triggers | Checks before turns, in context fallback, after tool-using turns, and on resume/fork |
| `working-message` | Calm animal-life spinner text below todos | Replaces pi's native working row so the visual order is todos, working message, editor |
| `command-history` | Footer count such as `12 cmds (ctrl+up/down)` | Loads history for the current folder on session start and appends every submitted input |
| `codex-fast` | Footer status `OpenAI fast mode` or `fast mode inactive` | Applies only to `openai` and `openai-codex` providers and never overwrites an existing `service_tier` |
| `efforts` | Custom labels in the native thinking selector/footer | Patches pi's available thinking levels and rewrites outgoing reasoning payloads for custom labels |
| `codex-goal` | Footer status such as `Pursuing goal` | Stores goal snapshots as session custom entries; queues hidden continuation turns while active |
| `rtk` | Footer `rtk <version>` and optional `/rtk` widget | Rewrites only the built-in `bash` tool; missing/old `rtk` degrades to pass-through |
| `message-shape-diagnostic` | Nothing unless enabled | Writes assistant message shape JSONL when `PI_BASIC_TOOLS_DIAG_SHAPES=1` is set |

### Settings and storage files

| File or directory | Owner | Purpose |
|---|---|---|
| `~/.pi/agent/capy-tools.json` | Capy Tools settings | Unified settings for `workingMessage`, `autoCompact`, and `codexFast` |
| `~/.pi/agent/cat-whimsical.json` | legacy migration source | Old working-message language file; read on first migration if unified config lacks `workingMessage` |
| `~/.pi/agent/auto-compact-settings.json` | legacy migration source | Old auto-compact file; read on first migration if unified config lacks `autoCompact` |
| `~/.pi/agent/settings.json` key `pi-codex-fast.enabled` | legacy migration source | Old Codex fast-mode setting; read on first migration if unified config lacks `codexFast` |
| `~/.pi/folder-history/` | command history | Per-working-directory JSONL input history |
| `~/.pi/effort_levels.json` | efforts | User-authored provider/model effort definitions |
| `~/.pi/effort_levels.state.json` | efforts | Last selected custom effort per provider/model |
| `.pi/fetch/` in the current project | fetch | Raw responses, converted Markdown, and fetch metadata |
| `.pi/rtk/latex/` in the current project | rtk | Full LaTeX transcripts captured by the local summarizer |
| `.pi/diagnostics/message-shapes.jsonl` | message-shape diagnostic | Assistant message shape records when diagnostics are enabled |

A typical `~/.pi/agent/capy-tools.json` looks like this:

```json
{
  "workingMessage": {
    "language": "en"
  },
  "autoCompact": {
    "autoCompactPercent": 90,
    "autoCompactTokenLimit": 0,
    "keepRecentPercent": 15,
    "strategy": "keep-recent"
  },
  "codexFast": {
    "enabled": false
  }
}
```

A typical `~/.pi/effort_levels.json` looks like this:

```json
[
  {
    "provider": "openai-codex",
    "model": "gpt-5.5",
    "efforts": ["max"],
    "mode": "add"
  },
  {
    "provider": "anthropic",
    "model": "claude-opus-4-6",
    "efforts": ["low", "medium", "high", "max"],
    "mode": "replace"
  }
]
```

### RTK environment variables

All RTK configuration remains environment-driven so the bash rewrite path stays independent from the unified Capy Tools settings file.

| Variable | Default | Effect |
|---|---|---|
| `PI_RTK_DISABLED=1` | unset | Disable RTK extension registration behavior except for a disabled `/rtk` notice |
| `PI_RTK_ASK_MODE=auto` | `auto` | Silently apply rtk ask-rule rewrites |
| `PI_RTK_ASK_MODE=confirm` | `auto` | Ask before applying rtk ask-rule rewrites |
| `PI_RTK_AWARENESS=0` | `1` | Skip the short system-prompt addition about RTK |
| `PI_RTK_TIMEOUT_MS=2000` | `2000` | Per-call timeout for `rtk rewrite` |
| `PI_RTK_QUIET=1` | unset | Suppress startup warning/info notifications |
| `PI_RTK_LATEX=0` | `1` | Disable the local LaTeX transcript summarizer |
| `PI_RTK_LATEX_LOG_DIR=/path` | `.pi/rtk/latex` | Override where LaTeX transcripts are stored |

Per-command opt-out is still available by prefixing one bash command with `RTK_DISABLED=1`, for example `RTK_DISABLED=1 git status`.

## Core helper tools

`repo_map` generates a compact project orientation map: root, git state, manifests, language mix, important files, directory clusters, and recent changes.

`read_block` reads the enclosing code or Markdown block around a line or symbol, so agents can inspect the right semantic unit without guessing offset/limit ranges.

`symbol_outline` lists a file's readable functions, classes, types, declarations, or Markdown sections with `read_block` line anchors, so agents can discover the right block before reading it.

`apply_patch` applies Codex-style patch text with `*** Begin Patch` / `*** End Patch` envelopes and `*** Add File`, `*** Update File`, `*** Move to`, and `*** Delete File` operations. This implementation intentionally stays close to Codex behavior: it accepts absolute paths, can overwrite add/move destinations, can delete files, creates missing parent directories for writes, and applies hunks sequentially. It is a direct extension-process filesystem writer, not pi's built-in `bash` approval flow; review paths carefully before using it, especially absolute paths and delete/move hunks. Delete is non-recursive and refuses directories.

`exec_command` starts a persistent terminal session for long-running or interactive commands and returns either an `exit_code` for finished commands or a `session_id` for commands that are still running.

`write_stdin` writes to, polls, or interrupts a running `exec_command` session; pass an empty `chars` string to poll fresh output and `"\u0003"` to send SIGINT. The first version is non-PTY, process-local, macOS-validated, and uses byte-based output limits through `max_output_bytes`; it is a direct extension-process shell runner rather than the built-in `bash` approval flow. Ctrl-C cleanup is cooperative, with abort-after-spawn escalating from SIGTERM to SIGKILL on macOS/POSIX; Windows process-tree cleanup is not validated in this package.

`ask_user` adds a simple free-form user prompt for cases where the agent needs an unstructured answer before continuing.

`ask_question` adds a small, session-friendly tool for asking the user a focused question with optional choices and free-text fallback.

`ask_questionnaire` adds a multi-question TUI for batching related questions with suggested options, recommended defaults, free-text answers, and a submit review screen.

`recap` is the user-facing narration channel. The tool takes a single `text: string` argument (8–12 words) and `renderCall` shows that prose to the user as one italic line; `renderResult` is empty, so the prose appears exactly once. The agent passes the sentence as a tool-call argument instead of emitting it as inline assistant text — this makes narration work the same way across providers whose models route prose into hidden thinking traces (Kimi, Gemini) and providers whose models emit prose inline (Claude). `recap` is intentionally absent from the `basic-tool-grouping` set, so a `recap` call cleanly separates a preamble line from the grouped `Used N tools` block that follows.

The extension contributes a `Recap discipline:` `before_agent_start` system-prompt fragment modelled after `Todo discipline:` and Codex CLI's preamble/progress-update guidance. Concretely:

- **Preamble before a batch** — call `recap({ text: "…" })` as the first tool in any parallel batch of related tool calls, with a forward-looking sentence (8–12 words) describing what the batch is about to do. The other tools run in parallel right after, in the same assistant message.
- **Progress update between segments** — in longer multi-phase tasks, call `recap({ text: "…" })` between work segments with a sentence that recaps what just finished and signals where the agent is heading next.
- **Combine** — one `recap` per batch, one per segment. Combine related work into a single preamble or progress update rather than calling `recap` per tool.
- **Skip when trivial** — skip `recap` for a single trivial action (one file read, one grep) where nothing is worth surfacing.
- **Tone** — light, friendly, and curious, like a coding partner handing off work.

The prompt uses invitational "discipline" language (no `must` / `Do not` / `---` divider mandates) and ships with concrete `recap({ text: "…" })` call examples, including a parallel-batch shape that pairs `recap` with another tool in the same message. The motivation: an earlier `work_checkpoint` design that mandated a `---` divider plus a structured checkpoint paragraph saw essentially zero agent-initiated calls; making the tool itself the visible narration channel (rather than a reminder to write prose) decouples user-visible narration from each model family's text-vs-thinking emission habits.

`thinking-steps` rewires Pi's built-in thinking renderer so chain-of-thought blocks use `├ `/`└ ` tree connectors with per-role glyphs (◫ inspect, ⌕ search, ✎ write, ▸ run, ↗ network, ◇ plan, ↔ compare, ✓ verify) and the same accent/muted color tokens as `enable-builtin-search`'s compact tool grouping. It is intentionally a passive renderer: no slash command, no shortcut, no status bar entry, and no persistence file. The renderer patches `AssistantMessageComponent` at session start, locks the view to `summary` mode (latest-N chronological steps), and releases the patch on session shutdown so Pi's native renderer comes back automatically. Multiple thinking blocks within one assistant message merge into a single `Thinking Steps · N thoughts` card. Forked from [pi-thinking-steps](https://github.com/fluxgear/pi-thinking-steps) (MIT, fluxgear); see `extensions/thinking-steps/LICENSE` for the original copyright notice.

`todo` is a single tool with the `create / update / list / get / delete / clear` actions used to track multi-step work — the agent marks tasks `in_progress` before starting, `completed` immediately after finishing, and uses `blockedBy` (with cycle detection) to express dependencies. State is replayed from the current branch on session start, compaction, and tree fork, so a `/reload` or branch switch preserves the task list. A persistent overlay above the editor shows a compact `Todos N/M` view (status glyphs, dimmed strikethrough on completed rows, `· <activeForm>` annotation on the in-progress row) that collapses overflow rather than scrolling. Forked from [`@juicesharp/rpiv-todo`](https://www.npmjs.com/package/@juicesharp/rpiv-todo) (MIT, juicesharp); the per-call surface is rewritten to flow through this package's basic-tool grouping (`Tracked N todos` header + single-line `• Added <subject>` rows) and the optional `@juicesharp/rpiv-i18n` peer dep is dropped. See `extensions/todo/LICENSE` for the original copyright notice.

`auto-compact` proactively manages context window usage before Pi's built-in after-`agent_end` auto-compaction would normally run. It checks at `turn_start` before model requests, in the `context` event as an emergency truncation fallback, after assistant messages that contain tool calls (`turn_end`), and on resume/forked sessions that reopen above the threshold. When this extension triggers `ctx.compact()`, it sends a short follow-up user message after compaction finishes and the agent is idle, so the in-flight task resumes instead of silently stopping. Settings live under the unified `autoCompact` section in `~/.pi/agent/capy-tools.json`, are edited through `/capy-tools-settings`, and migrate from the old standalone `~/.pi/agent/auto-compact-settings.json` file. Forked from [pi-auto-compact](https://github.com/capyup/pi-auto-compact) (MIT, capyup).

`working-message` replaces pi's default spinner working message with short calm animal-life narration in one of four languages (English, Chinese, Japanese, Korean). Use `/capy-tools-settings` for all Capy Tools settings; today it exposes the working-message language picker, auto-compact controls, and Codex fast-mode controls, persisted together in the unified config file `~/.pi/agent/capy-tools.json`. On first run it migrates the old standalone `~/.pi/agent/cat-whimsical.json` language value into the unified config. Pi's native `setWorkingMessage()` renders above extension widgets, so Capy Tools hides that native row during turns and mounts its own animated loader as an `aboveEditor` widget after `todo`; the visual order is `Todos ...` first, then the Capy Tools working message below it, then the editor. Forked from [pi-cat-whimsical](https://github.com/lulucatdev/pi-cat-whimsical) (MIT, lulucatdev); see `extensions/cat-whimsical/LICENSE` for the original copyright notice.

`command-history` persists submitted pi input per working directory under `~/.pi/folder-history/` and recalls it with `ctrl+up` / `ctrl+down` across sessions. It is forked from `pi-command-history` v0.1.2 (MIT); behavior is preserved apart from using an ASCII-only footer status string. The standalone `npm:pi-command-history` install can be removed after this bundle is active.

`codex-fast` adds `/codex-fast` and the `--fast` startup flag. When enabled and the active provider is `openai` or `openai-codex`, outgoing provider payloads get `service_tier: "priority"` unless the payload already set a service tier. The old standalone package stored `pi-codex-fast.enabled` in pi's global settings; Capy Tools migrates that value into `codexFast.enabled` in `~/.pi/agent/capy-tools.json` and exposes status/toggles through `/capy-tools-settings codex-fast ...`. Forked from `@calesennett/pi-codex-fast` v0.1.1; the captured npm package did not declare a license, so see [`docs/bundled-sources.md`](docs/bundled-sources.md) before publishing or redistributing this bundled source.

`efforts` lets you declare custom thinking/effort labels per provider+model in `~/.pi/effort_levels.json`, shows those labels in pi's native thinking-level selector, persists the most recent custom pick per model in `~/.pi/effort_levels.state.json`, and rewrites outgoing provider payload fields so labels such as `max` or numeric Anthropic budgets reach the API. Use `/efforts-reload` after editing the config file. Forked from local `pi-efforts` v0.1.0 (MIT); runtime behavior and config paths are intentionally preserved.

`codex-goal` adds Codex-style long-running goal tracking with the `/goal` command plus the model tools `get_goal`, `create_goal`, and `update_goal`. Goal state is stored in pi session custom entries, so it follows resume, fork, tree navigation, reload, and compaction without an external database. Active goals track elapsed time and assistant token usage, pause on aborted turns, can become budget-limited, and queue hidden follow-up turns while work remains. Forked from [pi-codex-goal](https://github.com/fitchmultz/pi-codex-goal) v0.1.10 (MIT); imports were adjusted for this repo, but behavior is intended to stay in sync with upstream.

`rtk` integrates [rtk](https://github.com/rtk-ai/rtk) (Rust Token Killer) by intercepting the built-in `bash` tool, running `rtk rewrite <command>`, and replacing commands with token-optimized equivalents when rtk finds one. `/rtk` shows rtk analytics in a transient widget and supports `/rtk on`, `/rtk off`, `/rtk status`, and `/rtk clear`. A bundled `skills/rtk/SKILL.md` explains when to call `rtk read`, `rtk grep`, `rtk find`, and rtk meta commands directly. Forked from `@capyup/pi-rtk` v0.1.0 (MIT); behavior, environment variables, and the local LaTeX transcript summarizer are preserved.

### Built-in search activation

`enable-builtin-search` activates pi's internal `grep`, `find`, and `ls` tools. It also installs compact group-aware renderers for common basic tools (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, and this package's file/navigation tools), so consecutive basic-tool calls collapse into a Codex-style action block like `Ran 3 commands` or `Explored 3 targets` and split again when a non-basic tool appears. Each tool row uses a tree connector (`├ `/`└ `) plus a role glyph; `write_stdin` polls and writes are aggregated onto the parent `exec_command` row's meta (e.g. `· 2 polls · 1 write`) instead of rendering as separate rows. Legacy custom `glob`, `grep`, and `list` implementations were removed so they cannot shadow pi's built-ins.

## Runtime requirements and dependencies

### Pi core package scope

Pi core packages have moved from `@mariozechner/*` to `@earendil-works/*`. This package imports and tests against the new scope (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui`) and keeps them as peer dependencies so pi supplies its own core runtime.

### Bundled in this package

Several formerly standalone pi packages are bundled directly. See [`docs/bundled-sources.md`](docs/bundled-sources.md) for source repositories, captured versions, licenses, local integration notes, and the update/sync procedure.

### External tools you must provide

- `fetch` requires [MarkItDown](https://github.com/microsoft/markitdown) for Markdown conversion.
- Activated built-in `grep` and `find` use pi's managed `rg` and `fd` tools; install them on `PATH` or let pi download them when needed.
- MarkItDown upstream requires Python 3.10 or newer.
- `rtk` integration is optional but active when `rtk` >= 0.23.0 is available on `PATH`; without it, Capy Tools leaves bash commands unchanged and reports the missing binary in the UI.
- Recommended installation method for MarkItDown: `pipx`, so the `markitdown` CLI is available on `PATH` without modifying the package itself.

## Installation

Install the pi package:

```bash
pi install npm:@capyup/pi-basic-tools
```

Install `pipx` if it is not already available:

```bash
brew install pipx
```

Alternative `pipx` installation:

```bash
python3 -m pip install --user pipx
python3 -m pipx ensurepath
```

Install MarkItDown for the `fetch` tool:

```bash
pipx install 'markitdown[all]'
```

Verify that MarkItDown is available:

```bash
markitdown --version
```

If pi is already running, reload extensions after installing or updating dependencies:

```text
/reload
```

## Testing

The test suite is strict by default: it uses real filesystem operations, real `git`, live network calls to `example.com` and Sourcegraph, and the real MarkItDown CLI. Missing dependencies are expected to fail tests instead of being mocked or skipped.

```bash
npm install
npm test
npm run test:build
npm run check
```

For real TUI renderer validation, run the PTY capture harness. It launches an actual interactive `pi` instance, captures the terminal ANSI stream, writes a plain-text transcript under `.pi/tui-captures/`, and asserts that the grouped action block uses the Codex-style rows (`Explored 3 targets`, `Outline`, `Read`, and `Search`) without `grep grep` duplication:

```bash
npm run test:tui-capture
```

To validate the user's normal Pi loading path rather than the isolated local-extension setup, run:

```bash
npm run test:tui-capture:current
```

Test coverage includes `repo_map`, `read_block`, `symbol_outline`, `apply_patch`, `exec_command`, `write_stdin`, `ask_user`, `ask_question`, `ask_questionnaire`, `recap`, `fetch`, `sourcegraph`, command history, Codex fast mode, custom efforts, Codex goals, RTK helpers, Codex-style compact tool rendering, grouped basic-tool rendering, `enable-builtin-search`, TUI capture harness support, and package wiring. See [`docs/testing.md`](docs/testing.md) for the dependency checklist, public research summary, and recommended pi extension testing workflow.

## Update

Update this package inside pi:

```bash
pi update npm:@capyup/pi-basic-tools
```

If you need to update MarkItDown as well:

```bash
pipx upgrade markitdown
```

## Fetch storage and conversion

The `fetch` tool does not inline the fetched page body into the tool result. Instead, it stores artifacts under the current project's `.pi/fetch/` directory using a timestamp-plus-slug layout similar to task artifacts. It does not fall back to the global `~/.pi`; if you run it directly from your home directory, it refuses and asks you to work from a project directory.

```text
.pi/fetch/<timestamp>-<slug>/
  response.<ext>
  content.md
  meta.json
```

### Files written by `fetch`

- `response.<ext>`: raw fetched response saved byte-for-byte with an extension inferred from `Content-Type` or URL.
- `content.md`: Markdown generated by MarkItDown when conversion succeeds.
- `meta.json`: metadata for the fetch run, including URL, content type, byte size, saved paths, and MarkItDown command attempts.

### MarkItDown execution order

`fetch` attempts MarkItDown in this order:

1. `~/.local/bin/markitdown`
2. `markitdown`
3. `python3 -m markitdown`
4. `python -m markitdown`

If conversion fails, the raw response is still preserved and `meta.json` records the failed attempts.

### Expected workflow after `fetch`

The `fetch` result explicitly tells the agent which saved file to read next. It also reports a rough line count and token estimate for that recommended file so the model can decide whether to read it immediately.

After calling `fetch`, inspect the generated Markdown with `read`:

```text
read .pi/fetch/<timestamp>-<slug>/content.md
```

If Markdown conversion fails, `fetch` points `read` at the raw saved response instead. For binary responses it still preserves the file, but line and token estimates are omitted because they would not be meaningful.

If Markdown conversion fails, inspect either of these instead:

```text
read .pi/fetch/<timestamp>-<slug>/response.<ext>
read .pi/fetch/<timestamp>-<slug>/meta.json
```

## Future tool ideas

Good candidates for later Capy Tools additions:

- `diagnostics` / `check`: run project-aware lint/test/typecheck commands with structured, compressed results.
- `symbols`: LSP or Serena-backed `find_symbol`, `references`, and safe rename/replace helpers.
- Structured git write tools: guarded branch/commit helpers that never hide dirty worktree risk.
- Context utilities: inspect active tools, model context usage, and recent large tool outputs.

Browser automation, heavy web research, and semantic language-server workflows may be better as separate packages or MCP integrations instead of bloating this core package.

## Notes

- `fetch` keeps a 5 MB response-size guard.
- `fetch` saves binary responses safely; it does not force them through text decoding before writing them to disk.
- Legacy custom `glob`, `grep`, and `list` implementations are intentionally absent; pi's built-in `grep`, `find`, and `ls` are preferred.

## License

MIT
