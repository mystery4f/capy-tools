---
name: showsignature
description: Extract compact structural signatures from source files and Markdown to understand a codebase quickly; use before summarizing architecture, entry points, modules, functions/classes, imports, or APIs.
license: ISC
compatibility: Requires Node.js. Uses the TypeScript compiler for TS/JS parsing.
metadata:
  author: capyup (ported from FredySandoval/showsignature)
  source_repository: https://github.com/FredySandoval/showsignature
  npm_package: showsignature
allowed-tools: showsignature
---

# showsignature skill guide

Use this skill to inspect code or Markdown structure without implementation noise.

`showsignature` extracts functions, classes, methods, imports, types, interfaces, variables, comments, document sections, TeX commands/labels, config keys, CSS rules, HTML landmarks, and SQL schema outlines.

## Use when

- Understanding an unfamiliar repository
- Summarizing a source file or folder
- Reviewing APIs or data shapes
- Preparing compact context for another AI tool
- Extracting Markdown headings, tables, or code blocks

## Basic usage examples

```sh
showsignature --file src/01-main.ts                # Inspect one file
showsignature --folder ./src                       # Inspect a folder
showsignature --folder .                           # Inspect the current directory
showsignature --folder . --show-only imports       # Show imports only
showsignature --folder ./src --show-only signatures,imports  # Structure + imports
showsignature --folder ./src --show-only interfaces,types    # Data shapes
showsignature --file README.md --show-only md:headings       # Markdown headings
showsignature --file README.md --show-only md:codeblocks    # Markdown code blocks
showsignature --folder . --lang-only py            # Python files only
showsignature --folder . --max-depth 2             # Limit recursion
showsignature --folder . --ignore-folder dist      # Skip a folder
showsignature --capabilities                       # Show supported languages/kinds
showsignature --file paper.tex --show-only tex     # LaTeX sections/commands/labels
showsignature --file lib.rs --show-only signatures,types,imports
showsignature --file app.ex --show-only signatures,types,imports
```

## Combine modes

```sh
showsignature --folder src --show-only signatures,imports,comments
```

## Pipeline usage

`showsignature` writes to stdout by default, so it works well with `grep`, `less`, `head`, and shell redirects.

```sh
showsignature --folder src | rg "function|class"
showsignature --folder src --show-only imports | rg "node:"
showsignature --folder src --show-only signatures | head -50
showsignature --folder src --show-only signatures,imports | tee structure.md
```

## Supported extract kinds

- `signatures` — functions, classes, methods, constructors
- `imports` — import statements
- `interfaces` — TypeScript/Go interfaces
- `types` — type aliases/declarations
- `variables` — variables/constants
- `comments` — code comments
- `md:headings` — Markdown headings
- `md:tables` — Markdown tables
- `md:codeblocks` — fenced code blocks
- `md:all` — full Markdown document
- `sections` — document sections (LaTeX and similar document formats)
- `tex:commands` — LaTeX macro/environment declarations
- `tex:labels` — LaTeX labels, refs, and citations
- `bib:entries` — BibTeX entry keys and types
- `data:keys` — JSON/YAML/TOML keys and table names
- `css:rules` — CSS/Sass/Less selectors and at-rules
- `html:landmarks` — HTML/XML/SVG landmarks, scripts, templates, and components
- `sql:schema` — SQL DDL schema objects

## Supported languages

| Language / family | Extensions |
| --- | --- |
| TypeScript | `.ts`, `.mts`, `.cts` |
| JavaScript | `.js`, `.mjs`, `.cjs` |
| Go | `.go` |
| Python | `.py` |
| Markdown / MDX | `.md`, `.mdx` |
| Rust | `.rs` |
| Elixir / EEx / HEEx | `.ex`, `.exs`, `.heex`, `.leex`, `.eex` |
| LaTeX / TeX / BibTeX | `.tex`, `.sty`, `.cls`, `.bib` |
| Java | `.java` |
| Kotlin | `.kt`, `.kts` |
| C# | `.cs` |
| C / C++ | `.c`, `.h`, `.cc`, `.cpp`, `.cxx`, `.hpp`, `.hh` |
| Ruby | `.rb` |
| PHP | `.php`, `.phtml` |
| Swift | `.swift` |
| Dart | `.dart` |
| Scala | `.scala`, `.sc` |
| R | `.r`, `.R` |
| Lua | `.lua` |
| Perl | `.pl`, `.pm` |
| Shell | `.sh`, `.bash`, `.zsh`, `.fish` |
| SQL | `.sql` |
| CSS / Sass / Less | `.css`, `.scss`, `.sass`, `.less` |
| JSON / YAML / TOML / Notebook | `.json`, `.jsonc`, `.yaml`, `.yml`, `.toml`, `.ipynb` |
| HTML / XML / SVG / Vue / Svelte | `.html`, `.htm`, `.xml`, `.xsd`, `.svg`, `.vue`, `.svelte` |

## Notes

- TS/JS use the TypeScript compiler AST; other new languages use dependency-free balanced/line scanners.
- `.gitignore`, `ignore_folder`, `max_depth`, `max_files`, and test-file filtering are respected during folder scans.
- Unsupported requested modes produce warnings; use `strict` to turn those warnings into errors.
