# showsignature Multilingual Support and Quality Upgrade

**Date**: 2026-05-21
**Status**: Implemented in Capy Tools 0.11.0

## Problem

`showsignature` is now useful as a compact source-structure tool, but its language coverage and parser quality are not yet good enough for a baseline Capy Tools capability.

Current support is limited to:

| Language | Extensions | Current parser style |
|---|---|---|
| TypeScript | `.ts`, `.mts`, `.cts` | TypeScript compiler AST |
| JavaScript | `.js`, `.mjs`, `.cjs` | TypeScript compiler AST in JS mode |
| Python | `.py` | Text + indentation scanner |
| Go | `.go` | Text + bracket/comment scanner |
| Markdown | `.md` | Text scanner |

Concrete defects / gaps:

1. **Language coverage is too narrow**: no LaTeX/TeX, Elixir, Rust, C/C++, Java/Kotlin, C#, Ruby, PHP, Shell, HTML/CSS, JSON/YAML/TOML, SQL, MDX, Vue, or Svelte.
2. **No `.gitignore` support after local port**: upstream used `globby` with `gitignore`; the port uses native `fs` traversal and skips only hard-coded folders.
3. **TypeScript/JavaScript misses common API shapes**: exported arrow functions, function expressions assigned to constants, object-literal methods, class fields, enums, namespaces, overload signatures, React components, route handlers, and test/build config exports are not consistently represented.
4. **Python scanner is not AST-backed**: decorators, async methods, nested classes, type aliases, dataclasses, properties, multiline imports, and syntax-edge cases can be lossy.
5. **Go scanner is not parser-backed**: methods with receivers are supported only textually; generic declarations, grouped const/type/var blocks, interfaces, struct fields, comments, and build tags need stronger handling and better tests.
6. **Markdown is too narrow**: `.mdx` is unsupported; table detection is loose; frontmatter, links, lists, and MDX export/import blocks are not represented.
7. **Extractor semantics vary by language**: `interfaces` is meaningful in TS/Go but not Rust/Elixir; `types` is broad; `variables` sometimes means constants, assignments, module attributes, or configuration keys.
8. **Bundle size risk**: adding heavy parser libraries naively can make `extensions/index.js` too large or platform-fragile.
9. **Quality is unmeasured**: there is no fixture matrix describing per-language expected output for real-world syntax.

## Goals

- Make `showsignature` a dependable first-pass code intelligence tool across mainstream repositories.
- Add required support for **LaTeX/TeX**, **Elixir**, and **Rust**.
- Expand toward broad mainstream coverage in staged waves while preserving fast startup and safe output.
- Fix defects that materially affect correctness: `.gitignore`, TS/JS API coverage, Markdown/MDX handling, and inconsistent extractor semantics.
- Keep output compact and grep-friendly; this is still a structural summary tool, not a full semantic indexer.
- Provide fixture-based acceptance tests for every supported language and extractor.

## Non-Goals

- Full language-server quality semantic resolution.
- Type checking, macro expansion, dependency resolution, or running compilers.
- Formatting or rewriting source code.
- Perfect secret detection. Existing redaction should improve, but `showsignature` is not a replacement for a dedicated secret scanner.
- Support for every niche language in the first implementation wave.

## Design Principles

1. **Progressive quality tiers**: every language declares its parser quality (`ast`, `balanced-scan`, `line-scan`, `data`) and known limits.
2. **No external command dependency by default**: extraction should work inside the pi runtime without requiring `rustc`, `mix`, `pdflatex`, `go`, `python`, or `tree-sitter` binaries.
3. **Prefer AST when already cheap and stable**: keep TS/JS on the TypeScript compiler; consider native parsers only when they do not create platform friction.
4. **Balanced scanners over regex-only**: for languages without AST, use comment/string-aware scanners with brace/paren/indent state.
5. **Extractor contract stays stable**: all languages emit `ExtractEntry` with `kind`, `lines`, `metadata.sourcePos`, and `metadata.sourceLine` where possible.
6. **Language-specific kinds are allowed but normalized**: e.g. LaTeX can emit `tex:commands`, but common modes should map to existing concepts when useful.
7. **Tests define support**: a language is not considered supported until fixtures cover imports/includes, signatures/sections, types/data shapes, variables/constants, comments, and representative edge cases.

## Proposed Architecture

### A. Language Adapter Metadata

Extend `LanguageAdapterMetadata` with quality and capability fields:

```ts
interface LanguageAdapterMetadata {
  id: string;
  extensions: readonly string[];
  fenceLang: string;
  displayName?: string;
  version?: string;
  experimental?: boolean;
  parserQuality?: "ast" | "balanced-scan" | "indent-scan" | "line-scan" | "data";
  capabilities?: readonly ExtractKind[];
  knownLimits?: readonly string[];
}
```

The CLI/tool help and tests should use this metadata to explain support honestly.

### B. Shared Scanner Utilities

Create `extensions/showsignature/scanners/`:

| File | Purpose |
|---|---|
| `lines.ts` | `splitLines`, `lineStarts`, `sourcePosToLine`, CRLF-safe helpers |
| `comments.ts` | language comment configs (`//`, `#`, `--`, `%`, block comments) |
| `balanced.ts` | string/comment-aware brace/paren/bracket scanner |
| `indent.ts` | indentation block collector for Python/Ruby/YAML-ish formats |
| `declarations.ts` | common helpers for multiline headers and compact signatures |
| `frontmatter.ts` | YAML/TOML frontmatter extraction for Markdown/MDX |
| `gitignore.ts` | local `.gitignore` parser and matcher, no `globby` dependency |

### C. Capability Model

Keep the existing shared extract kinds:

- `signatures`
- `imports`
- `interfaces`
- `types`
- `variables`
- `comments`

Add documented optional plugin kinds:

| Kind | Used by | Meaning |
|---|---|---|
| `sections` | LaTeX, Markdown-like formats, notebooks | Structural document sections |
| `tex:commands` | LaTeX/TeX | Macro definitions and important commands |
| `tex:labels` | LaTeX/TeX | Labels, refs, citations, bibliography links |
| `data:keys` | JSON/YAML/TOML | Top-level config keys and nested key paths |
| `css:rules` | CSS/SCSS/Sass/Less | Selectors and at-rules |
| `html:landmarks` | HTML/Vue/Svelte | Scripts, styles, templates, IDs/classes, components |
| `sql:schema` | SQL | DDL tables/views/indexes/functions |

`--show-only md` remains an alias for `md:all`; add `tex` alias for `sections,tex:commands,tex:labels`.

## Language Roadmap

### Wave 0: Fix Existing Support (Must Do First)

| Area | Required improvements |
|---|---|
| File discovery | Implement `.gitignore` parsing; keep built-in hard skips (`.git`, `node_modules`, `dist`, etc.); add fixture tests for ignored files. |
| TS/JS | Support exported const arrow functions, function expressions, class fields, accessors, enums, namespaces, default exports, overload signatures, object-literal methods, React component patterns, CommonJS `module.exports` / `exports.foo`. |
| Python | Upgrade scanner to handle decorators, `async def`, nested class methods, `@property`, dataclasses, multiline imports, type aliases (`TypeAlias`, `type X =` when supported), module constants. Consider optional AST parser later. |
| Go | Improve receiver methods, generic type/function declarations, struct summaries, interface summaries, grouped declarations, build tags, comment attachment. |
| Markdown | Add `.mdx`; improve table detection to require header/separator shape; extract frontmatter, imports/exports, headings, code blocks, links. |
| Output | Add capability metadata to details; report unsupported requested modes as warnings instead of silent empty output. |

Acceptance: current tests plus new regression fixtures all pass; `npm run check` passes.

### Wave 1: Required New Languages

#### Rust (`.rs`)

Parser strategy: balanced scanner with Rust-aware comments/strings/macros; no `rustc` dependency.

Supported extraction:

| Kind | Output |
|---|---|
| `imports` | `use`, `extern crate`, `mod` declarations |
| `signatures` | `fn`, `async fn`, `const fn`, trait methods, impl methods, `macro_rules!`, public modules |
| `interfaces` | `trait` definitions |
| `types` | `struct`, `enum`, `union`, `type`, `trait` headers |
| `variables` | top-level `const` and `static` |
| `comments` | `//`, `//!`, `///`, `/* */`, `/*! */`, `/** */` |

Representative fixture cases:

- `pub async fn fetch<T>(...) -> Result<T>`
- `impl<T> Foo<T> where T: Clone { ... }`
- `trait Service { async fn call(...); }`
- `#[derive(Debug)] pub struct User { ... }`
- `macro_rules! route { ... }`
- module-level docs `//!`

#### Elixir (`.ex`, `.exs`, `.heex`, `.leex`, `.eex` partial support)

Parser strategy: indentation/block keyword scanner with `do`/`end` stack; string/comment-aware.

Supported extraction:

| Kind | Output |
|---|---|
| `imports` | `alias`, `import`, `require`, `use` |
| `signatures` | `defmodule`, `def`, `defp`, `defmacro`, `defmacrop`, callbacks, protocols, impls |
| `interfaces` | `defprotocol`, `@callback`, `@macrocallback`, `@behaviour` |
| `types` | `@type`, `@typep`, `@opaque`, structs (`defstruct`) |
| `variables` | module attributes (`@foo`) and `defstruct` compact summary |
| `comments` | `#` comments, module/function docs via `@moduledoc`, `@doc` |

Representative fixture cases:

- Phoenix controllers/live views
- GenServer modules
- protocols/implementations
- typespecs and callbacks
- pipelines in multiline function heads
- HEEx templates: extract components/tags and embedded Elixir blocks as experimental

#### LaTeX / TeX (`.tex`, `.sty`, `.cls`, `.bib`)

Parser strategy: TeX-aware line scanner with comment handling (`%`), brace-aware command collector, and BibTeX entry scanner.

Supported extraction:

| Kind | Output |
|---|---|
| `sections` | `\part`, `\chapter`, `\section`, `\subsection`, `\subsubsection`, `\paragraph` |
| `imports` | `\documentclass`, `\usepackage`, `\input`, `\include`, `\bibliography`, `\addbibresource` |
| `tex:commands` | `\newcommand`, `\renewcommand`, `\providecommand`, `\DeclareMathOperator`, environment definitions |
| `types` | theorem/environment definitions (`\newtheorem`, `\newenvironment`) |
| `variables` | metadata commands (`\title`, `\author`, `\date`, custom simple macros) |
| `tex:labels` | `\label`, `\ref`, `\eqref`, `\cite`, `\autoref`, `\cref` |
| `comments` | `%` comments not escaped as `\%` |
| `bib:entries` | BibTeX entry keys and types from `.bib` files |

Representative fixture cases:

- thesis document with chapters and included files
- package-heavy preamble
- escaped percent signs
- multiline `\newcommand` with nested braces
- theorem environments
- BibTeX entries with multiline fields

Acceptance for Wave 1:

- `showsignature --file fixture.rs --show-only signatures,types,imports` returns expected Rust API shape.
- `showsignature --file fixture.ex --show-only signatures,types,imports` returns expected Elixir module shape.
- `showsignature --file paper.tex --show-only sections,imports,tex:commands,tex:labels` returns expected document map.
- Each new language has at least 8 focused tests and 2 integration tests via the pi extension host.

### Wave 2: Mainstream Code Languages

| Language | Extensions | Parser strategy | Required extractors |
|---|---|---|---|
| Java | `.java` | balanced scan | imports, signatures, interfaces, types, variables, comments |
| Kotlin | `.kt`, `.kts` | balanced scan | imports, signatures, interfaces, types, variables, comments |
| C# | `.cs` | balanced scan | imports/usings, signatures, interfaces, types, variables, comments |
| C / C++ | `.c`, `.h`, `.cc`, `.cpp`, `.cxx`, `.hpp`, `.hh` | preprocessor-aware balanced scan | includes, signatures, types, variables/macros, comments |
| Ruby | `.rb` | keyword/end scanner | imports/requires, signatures, modules/classes, constants, comments |
| PHP | `.php`, `.phtml` | balanced scan | namespaces/use, signatures, interfaces/traits/classes, variables/constants, comments |
| Swift | `.swift` | balanced scan | imports, functions/classes/structs/protocols, typealiases, properties, comments |
| Dart | `.dart` | balanced scan | imports/exports/parts, signatures, classes/mixins/extensions, typedefs, variables, comments |
| Scala | `.scala`, `.sc` | balanced scan | imports, defs/classes/traits/objects, types, vals/vars, comments |
| R | `.r`, `.R` | line/balanced scan | library/source, functions, S3/S4/R6 classes, assignments, comments |
| Lua | `.lua` | keyword scanner | require, functions, tables/modules, locals, comments |
| Perl | `.pl`, `.pm` | balanced scan | use/require/package, subs, variables, comments |

Wave 2 acceptance: each language has minimum fixture coverage for imports, signatures, types/classes, constants/variables, comments, multiline declarations, and one real-framework-flavored fixture.

### Wave 3: Web, Data, Shell, Config, and Query Files

| Family | Extensions | Extractors |
|---|---|---|
| Shell | `.sh`, `.bash`, `.zsh`, `.fish` | comments, functions, variables, sourced files, exported env vars |
| SQL | `.sql` | tables, views, indexes, functions/procedures, CTE/query outline, comments |
| HTML | `.html`, `.htm` | scripts, styles, landmarks, IDs/classes, forms, comments |
| CSS | `.css`, `.scss`, `.sass`, `.less` | selectors, at-rules, custom properties, comments |
| JSON | `.json`, `.jsonc` | top-level keys, nested key paths, comments for JSONC |
| YAML | `.yaml`, `.yml` | top-level keys, anchors, document markers, comments |
| TOML | `.toml` | tables, arrays of tables, keys, comments |
| XML | `.xml`, `.xsd`, `.svg` | tags, namespaces, IDs, schema declarations, comments |
| Vue | `.vue` | template components, script imports/signatures, style selectors |
| Svelte | `.svelte` | script imports/signatures, components, markup landmarks, style selectors |
| Notebooks | `.ipynb` | markdown headings, code cell imports/signatures, cell count metadata |

Wave 3 acceptance: no claim of deep semantic support; output should be useful for repo orientation and safe for compact context.

## Must-Fix Existing Issues

These should be fixed before or alongside new languages:

1. **`.gitignore` parity**
   - Implement a small matcher for root and nested `.gitignore` files.
   - Respect negation (`!pattern`) and directory-only patterns (`foo/`) enough for common repos.
   - Keep explicit `ignore_folder` as a higher-priority user override.

2. **TS/JS API coverage**
   - Add extractors for:
     - `export const foo = (...) => ...`
     - `const foo = function (...) {}`
     - `export default function/class`
     - `module.exports = { ... }`, `exports.foo = ...`
     - `enum`, `namespace`, class properties/accessors
     - object methods in exported objects
   - Preserve compact initializers and redaction.

3. **Markdown/MDX correctness**
   - Support `.mdx`.
   - Table detection requires separator line like `|---|---|`.
   - Extract YAML/TOML frontmatter as `data:keys` and MDX `import`/`export` as `imports`.

4. **Unsupported mode feedback**
   - If user requests `interfaces` for Python or `md:tables` for Rust, return a warning explaining unsupported modes for that language instead of silently empty output.

5. **Fixture matrix**
   - Add `tests/fixtures/showsignature/<lang>/` with one `basic` and one `edge` fixture per language.
   - Snapshot only the compact output, not internal AST details.

6. **Bundle-size monitoring**
   - Add a build-size note in test output or a lightweight script that reports `extensions/showsignature.js` and `extensions/index.js` sizes.
   - Avoid adding native or WASM parser dependencies unless justified by quality and portability.

## Proposed File Layout

```text
extensions/showsignature/
  core-types.ts
  core.ts
  index.ts
  scanners/
    balanced.ts
    comments.ts
    declarations.ts
    frontmatter.ts
    gitignore.ts
    indent.ts
    lines.ts
  languages/
    typescript/
    javascript/          # optional split later; can remain TS family adapter initially
    python/
    go/
    markdown/
    rust/
    elixir/
    latex/
    java/
    kotlin/
    csharp/
    cpp/
    ruby/
    php/
    shell/
    web/
    data/
    sql/
tests/fixtures/showsignature/
  ts/
  js/
  py/
  go/
  mdx/
  rust/
  elixir/
  latex/
  ...
```

## Tool UX Changes

Current params remain:

- `file`
- `folder`
- `show_only`
- `lang_only`
- `include_tests`
- `max_depth`
- `ignore_folder`
- `line_number`
- `output_markdown`

Add optional params:

| Param | Purpose |
|---|---|
| `capabilities` | When true, return supported languages, extensions, parser quality, and extract kinds. |
| `strict` | When true, unsupported extract kinds become errors instead of warnings. |
| `max_files` | Safety cap for very large repo scans. |
| `max_entries_per_file` | Prevent huge Markdown/SQL/config outputs from flooding context. |
| `include_hidden` | Include dotfiles except `.git`; default false. |

## Testing Plan

### Unit Tests

For every adapter:

- `buildContext` creates line/position metadata correctly.
- Each extractor returns stable `kind`, `lines`, `sourcePos`, and `sourceLine`.
- Comments inside strings are ignored.
- Multiline declarations are compacted predictably.
- Unsupported extract kinds produce warnings.

### Integration Tests

- `discoverFiles` respects `.gitignore`, `include_tests`, `max_depth`, `ignore_folder`, `max_files`.
- `runPipeline` merges entries in source order across extractors.
- pi extension host runs single-file and folder scans for every Wave 1 language.
- `output_markdown` wraps output with the right fence language when only one language is seen.

### Fixture Acceptance Matrix

Each language gets fixtures for:

1. imports/includes/requires
2. functions/methods/modules/classes
3. types/interfaces/protocols/traits where relevant
4. variables/constants/attributes/config keys
5. comments/docs
6. multiline declarations
7. language-specific edge cases
8. one real-world framework style file

## Rollout Plan

### Phase 1: Foundation and Fixes

- Add scanner utilities.
- Add `.gitignore` support.
- Add capability metadata.
- Fix TS/JS API coverage.
- Add MDX and Markdown table/frontmatter improvements.
- Add warning behavior for unsupported modes.

### Phase 2: Required Languages

- Add Rust adapter.
- Add Elixir adapter.
- Add LaTeX/TeX/BibTeX adapter.
- Add tests and skill documentation for all three.

### Phase 3: Mainstream Language Expansion

- Add Java, Kotlin, C#, C/C++, Ruby, PHP, Shell.
- Add CSS/HTML/data adapters if not already added through shared scanner utilities.

### Phase 4: Web and Data Completeness

- Add Vue, Svelte, SQL, XML/SVG, notebooks.
- Add optional `capabilities` output and size reporting.

## Acceptance Criteria

A release can claim this SPEC is implemented when:

- `showsignature --capabilities` lists at least TS, JS, Python, Go, Markdown/MDX, Rust, Elixir, LaTeX/TeX, Java, Kotlin, C#, C/C++, Ruby, PHP, Shell, HTML, CSS, JSON, YAML, TOML, SQL.
- Rust, Elixir, and LaTeX have non-experimental support with tests for all required extractors.
- `.gitignore` behavior is covered by tests and matches common repo expectations.
- TS/JS captures exported arrows, default exports, enums, namespaces, class fields, and CommonJS exports.
- Markdown supports `.mdx`, frontmatter, stricter tables, and code blocks.
- Unsupported mode warnings are visible in tool output/details.
- `npm run check` passes.
- A live pi smoke test verifies `showsignature` renders as a grouped inspect tool without UI regressions.

## Open Questions

1. Should we keep everything dependency-free, or allow one carefully chosen pure-JS parser package for specific languages?
2. Should LaTeX extraction follow included files (`\input`, `\include`) automatically, or only report them as imports?
3. Should `show_only=all` include comments by default? Current default is intentionally compact (`signatures` only).
4. Should config/data languages default to `data:keys`, or should they require explicit `show_only=data:keys`?
5. Should `.heex`, `.vue`, `.svelte`, and `.ipynb` be marked experimental even after first implementation?
