import { describe, expect, test } from "bun:test";
import {
  buildDefaultRegistry,
  createLanguageRegistry,
  discoverFiles,
  extractFromSource,
  formatFinalOutput,
  formatPlainOutput,
  isTestFile,
  mergeAndSortEntries,
  parseExtractOptions,
  runPipeline,
  stripCombinedPositions,
  toDisplayPath,
} from "../extensions/showsignature/index";

import { createExtensionHost, withTempDir } from "./extension-host";
import showsignatureExtension from "../extensions/showsignature";

function resultText(result: { entries: Array<{ lines: string[] }> }): string {
  return result.entries.map((entry) => entry.lines.join("\n")).join("\n");
}

// ------------------------------------------------------------------
// Core — registry & types
// ------------------------------------------------------------------
describe("showsignature core — registry", () => {
  test("buildDefaultRegistry includes core and multilingual adapters", () => {
    const registry = buildDefaultRegistry();
    const langs = registry.supportedLanguages().sort();
    expect(langs).toContain("ts");
    expect(langs).toContain("js");
    expect(langs).toContain("py");
    expect(langs).toContain("go");
    expect(langs).toContain("md");
    expect(langs).toContain("rust");
    expect(langs).toContain("elixir");
    expect(langs).toContain("latex");
    expect(langs).toContain("java");
    expect(langs).toContain("cpp");
    expect(langs).toContain("shell");
    expect(langs).toContain("sql");
    expect(langs.length).toBeGreaterThanOrEqual(20);
  });

  test("inferFromFile works for known extensions", () => {
    const registry = buildDefaultRegistry();
    expect(registry.inferFromFile("foo.ts")).toBe("ts");
    expect(registry.inferFromFile("foo.mjs")).toBe("js");
    expect(registry.inferFromFile("foo.py")).toBe("py");
    expect(registry.inferFromFile("foo.go")).toBe("go");
    expect(registry.inferFromFile("foo.md")).toBe("md");
    expect(registry.inferFromFile("foo.mdx")).toBe("md");
    expect(registry.inferFromFile("foo.rs")).toBe("rust");
    expect(registry.inferFromFile("foo.ex")).toBe("elixir");
    expect(registry.inferFromFile("foo.tex")).toBe("latex");
    expect(registry.inferFromFile("foo.txt")).toBeUndefined();
  });

  test("createLanguageRegistry supports lazy registration", async () => {
    const registry = createLanguageRegistry();
    let loaded = false;
    registry.registerLazy({
      id: "lazy-lang",
      extensions: [".lazy"],
      load: async () => {
        loaded = true;
        const adapter = {
          id: "lazy-lang",
          extensions: [".lazy"],
          fenceLang: "lazy",
          extractors: new Map(),
          buildContext: (opts: { source: string; filePath: string }) => ({ source: opts.source, filePath: opts.filePath }),
          supportsKind: () => false,
        };
        return adapter as any;
      },
    });
    expect(registry.has("lazy-lang")).toBe(true);
    expect(registry.get("lazy-lang")).toBeUndefined();
    const adapter = await registry.getOrLoad("lazy-lang");
    expect(loaded).toBe(true);
    expect(adapter).not.toBeUndefined();
    expect(registry.get("lazy-lang")).toBe(adapter);
  });
});

// ------------------------------------------------------------------
// Core — config helpers
// ------------------------------------------------------------------
describe("showsignature core — helpers", () => {
  test("parseExtractOptions rejects unknown kinds", () => {
    expect(() => parseExtractOptions("signatures,notreal", ["signatures", "imports"])).toThrow();
  });

  test("parseExtractOptions deduplicates", () => {
    const kinds = parseExtractOptions("signatures,signatures,imports", ["signatures", "imports", "types"]);
    expect(kinds).toEqual(["signatures", "imports"]);
  });

  test("isTestFile detects test paths", () => {
    expect(isTestFile("src/tests/foo.ts")).toBe(true);
    expect(isTestFile("src/foo.test.ts")).toBe(true);
    expect(isTestFile("src/foo.spec.js")).toBe(true);
    expect(isTestFile("src/foo.ts")).toBe(false);
  });

  test("toDisplayPath makes paths relative", () => {
    const rel = toDisplayPath("/very/long/absolute/path/to/file.ts");
    // Should be relative to cwd and contain forward slashes
    expect(rel).not.toStartWith("/");
    expect(rel.includes("\\")).toBe(false);
  });
});

// ------------------------------------------------------------------
// Core — TypeScript extraction
// ------------------------------------------------------------------
describe("showsignature core — typescript extraction", () => {
  const sampleTs = `
import * as ts from "typescript";

export interface Point {
  x: number;
  y: number;
}

export type PointTuple = [number, number];

export class Rect {
  constructor(public x: number, public y: number) {}
  area(): number { return this.x * this.y; }
}

export function distance(p1: Point, p2: Point): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

const SECRET = "should-be-redacted";
`;

  test("extracts signatures", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("ts")!;
    const result = extractFromSource({
      adapter,
      filePath: "test.ts",
      source: sampleTs,
      extractOrder: ["signatures"],
    });
    const kinds = result.entries.map((e) => e.kind);
    expect(kinds.every((k) => k === "signatures")).toBe(true);
    const text = result.entries.map((e) => e.lines.join("\n")).join("\n");
    expect(text).toContain("class Rect");
    expect(text).toContain("constructor");
    expect(text).toContain("distance");
  });

  test("extracts imports + interfaces + types", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("ts")!;
    const result = extractFromSource({
      adapter,
      filePath: "test.ts",
      source: sampleTs,
      extractOrder: ["imports", "interfaces", "types"],
    });
    const grouped = Object.groupBy(result.entries, (e) => e.kind);
    expect((grouped.imports ?? []).length).toBe(1);
    expect((grouped.interfaces ?? []).length).toBe(1);
    expect((grouped.types ?? []).length).toBe(1);
  });

  test("extracts variables", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("ts")!;
    const result = extractFromSource({
      adapter,
      filePath: "test.ts",
      source: sampleTs,
      extractOrder: ["variables"],
    });
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
    const text = result.entries.map((e) => e.lines.join("\n")).join("\n");
    expect(text).toContain("const SECRET");
  });
});

// ------------------------------------------------------------------
// Core — Markdown extraction
// ------------------------------------------------------------------
describe("showsignature core — markdown extraction", () => {
  const sampleMd = `# Hello

## Section A

Some text.

| a | b |
|---|---|
| 1 | 2 |

\`\`\`ts
const x = 1;
\`\`\`
`;

  test("extracts headings", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("md")!;
    const result = extractFromSource({
      adapter,
      filePath: "test.md",
      source: sampleMd,
      extractOrder: ["md:headings"],
    });
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].lines[0]).toContain("# Hello");
    expect(result.entries[1].lines[0]).toContain("## Section A");
  });

  test("extracts tables and code blocks", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("md")!;
    const result = extractFromSource({
      adapter,
      filePath: "test.md",
      source: sampleMd,
      extractOrder: ["md:tables", "md:codeblocks"],
    });
    const grouped = Object.groupBy(result.entries, (e) => e.kind);
    expect((grouped["md:tables"] ?? []).length).toBe(1);
    expect((grouped["md:codeblocks"] ?? []).length).toBe(1);
  });
});

// ------------------------------------------------------------------
// Core — Wave 1 language extraction
// ------------------------------------------------------------------
describe("showsignature core — rust elixir latex extraction", () => {
  test("extracts Rust imports, signatures, traits, types, and constants", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("rust")!;
    const result = extractFromSource({
      adapter,
      filePath: "lib.rs",
      source: `use std::fmt;\n\npub trait Service {\n  fn call(&self);\n}\n\n#[derive(Debug)]\npub struct User { id: u64 }\n\npub async fn fetch<T>() -> Result<T, Error> { todo!() }\npub const LIMIT: usize = 10;\n`,
      extractOrder: ["imports", "signatures", "interfaces", "types", "variables"],
    });
    const text = result.entries.map((e) => e.lines.join("\n")).join("\n");
    expect(text).toContain("use std::fmt");
    expect(text).toContain("pub trait Service");
    expect(text).toContain("pub struct User");
    expect(text).toContain("pub async fn fetch");
    expect(text).toContain("pub const LIMIT");
  });

  test("extracts Elixir modules, functions, typespecs, callbacks, and attributes", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("elixir")!;
    const result = extractFromSource({
      adapter,
      filePath: "service.ex",
      source: `defmodule Demo.Service do\n  use GenServer\n  alias Demo.User\n  @behaviour Demo.Callback\n  @type id :: integer()\n  @limit 10\n  def start_link(opts) do\n    GenServer.start_link(__MODULE__, opts)\n  end\n  defp private_call(), do: :ok\nend\n`,
      extractOrder: ["imports", "signatures", "interfaces", "types", "variables"],
    });
    const text = result.entries.map((e) => e.lines.join("\n")).join("\n");
    expect(text).toContain("defmodule Demo.Service");
    expect(text).toContain("use GenServer");
    expect(text).toContain("@behaviour");
    expect(text).toContain("@type id");
    expect(text).toContain("@limit");
    expect(text).toContain("def start_link");
  });

  test("extracts LaTeX sections, imports, commands, labels, and BibTeX entries", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("latex")!;
    const result = extractFromSource({
      adapter,
      filePath: "paper.tex",
      source: `\\documentclass{article}\n\\usepackage{amsmath}\n\\title{Demo}\n\\newcommand{\\R}{\\mathbb{R}}\n\\section{Intro}\n\\label{sec:intro}\nAs shown by \\cite{knuth}.\n@book{knuth,\n  title={The TeXbook}\n}\n`,
      extractOrder: ["sections", "imports", "tex:commands", "tex:labels", "variables", "bib:entries"].map((kind) => kind as any),
    });
    const text = result.entries.map((e) => e.lines.join("\n")).join("\n");
    expect(text).toContain("\\documentclass");
    expect(text).toContain("\\section{Intro}");
    expect(text).toContain("\\newcommand");
    expect(text).toContain("\\label{sec:intro}");
    expect(text).toContain("@book{knuth");
  });
});

// ------------------------------------------------------------------
// Core — complete language coverage matrix
// ------------------------------------------------------------------
interface LanguageCoverageCase {
  file: string;
  source: string;
  expectedByKind: Record<string, string[]>;
}

const LANGUAGE_COVERAGE_CASES: Record<string, LanguageCoverageCase> = {
  ts: {
    file: "coverage.ts",
    source: `import dep from "dep";
// ts comment
export interface Named { name: string }
export type Id = string;
export enum Kind { A }
export namespace Models { export type Key = string; }
export class Box { value: number; get label(): string { return ""; } set label(v: string) {} }
export const make = (id: Id): Named => ({ name: id });
export const LIMIT = 3;
`,
    expectedByKind: { imports: ["import dep"], comments: ["// ts comment"], interfaces: ["interface Named"], types: ["type Id", "enum Kind", "namespace Models"], signatures: ["class Box", "value: number", "get label", "set label", "const make"], variables: ["const make", "const LIMIT"] },
  },
  js: {
    file: "coverage.js",
    source: `import fs from "node:fs";
// js comment
class Runner { run() {} }
function boot() {}
const answer = 42;
module.exports = { go() {} };
`,
    expectedByKind: { imports: ["import fs"], comments: ["// js comment"], interfaces: [], types: [], signatures: ["class Runner", "function boot", "module.exports"], variables: ["const answer"] },
  },
  py: {
    file: "coverage.py",
    source: `import os
from sys import (
    path,
)
# py comment
class Service:
    def call(self, name: str) -> str:
        return name
async def fetch(value: int) -> int:
    return value
CONFIG = {"debug": True}
`,
    expectedByKind: { imports: ["import os", "from sys import"], comments: ["# py comment"], signatures: ["class Service", "def call", "async def fetch"], variables: ["CONFIG"] },
  },
  go: {
    file: "coverage.go",
    source: `package demo
import (
  "context"
  "fmt"
)
// go comment
type Service interface { Call() error }
type User struct { ID int }
const Limit = 10
var Name = "demo"
func Run(ctx context.Context) error { fmt.Println(Name); return nil }
`,
    expectedByKind: { imports: ["import (", '"fmt"'], comments: ["// go comment"], interfaces: ["type Service interface"], types: ["type User struct"], variables: ["const Limit", "var Name"], signatures: ["func Run"] },
  },
  md: {
    file: "coverage.mdx",
    source: `---
title: Demo
tags: [tool]
---
import Widget from "./Widget";
# Title

| a | b |
|---|---|
| 1 | 2 |

\`\`\`ts
const x = 1;
\`\`\`
`,
    expectedByKind: { "md:all": ["# Title"], "md:headings": ["# Title"], "md:tables": ["| a | b |"], "md:codeblocks": ["```ts"], "data:keys": ["title: Demo", "tags: [tool]"], imports: ["import Widget"] },
  },
  rust: {
    file: "coverage.rs",
    source: `use std::fmt;
// rust comment
pub trait Service { fn call(&self); }
pub struct User { id: u64 }
pub async fn fetch<T>() -> Result<T, Error> { todo!() }
pub const LIMIT: usize = 10;
`,
    expectedByKind: { imports: ["use std::fmt"], comments: ["// rust comment"], interfaces: ["trait Service"], types: ["struct User", "trait Service"], signatures: ["pub async fn fetch"], variables: ["pub const LIMIT"] },
  },
  elixir: {
    file: "coverage.ex",
    source: `defmodule Demo.Service do
  # elixir comment
  use GenServer
  alias Demo.User
  @behaviour Demo.Callback
  @type id :: integer()
  @limit 10
  def start_link(opts), do: GenServer.start_link(__MODULE__, opts)
end
`,
    expectedByKind: { imports: ["use GenServer", "alias Demo.User"], comments: ["# elixir comment"], interfaces: ["@behaviour"], types: ["@type id"], signatures: ["defmodule Demo.Service", "def start_link"], variables: ["@limit"] },
  },
  latex: {
    file: "coverage.tex",
    source: `% latex comment
\\documentclass{article}
\\usepackage{amsmath}
\\title{Demo}
\\newcommand{\\R}{\\mathbb{R}}
\\newtheorem{lemma}{Lemma}
\\section{Intro}
\\label{sec:intro}
@book{knuth,
  title={The TeXbook}
}
`,
    expectedByKind: { comments: ["% latex comment"], imports: ["\\documentclass", "\\usepackage"], sections: ["\\section{Intro}"], "tex:commands": ["\\newcommand"], types: ["\\newtheorem"], variables: ["\\title"], "tex:labels": ["\\label{sec:intro}"], "bib:entries": ["@book{knuth"] },
  },
  java: {
    file: "coverage.java",
    source: `package demo;
import java.util.*;
// java comment
public interface Service {}
public class UserService { public String name() { return "x"; } }
public static final int LIMIT = 1;
`,
    expectedByKind: { imports: ["import java"], comments: ["// java comment"], interfaces: ["interface Service"], types: ["class UserService"], signatures: ["name()"], variables: ["LIMIT"] },
  },
  kotlin: {
    file: "coverage.kt",
    source: `package demo
import kotlin.collections.*
// kotlin comment
interface Service
data class User(val id: Int)
fun greet(name: String): String = name
val answer = 42
`,
    expectedByKind: { imports: ["import kotlin"], comments: ["// kotlin comment"], interfaces: ["interface Service"], types: ["data class User"], signatures: ["fun greet"], variables: ["val answer"] },
  },
  csharp: {
    file: "coverage.cs",
    source: `using System;
// csharp comment
public interface IService {}
public record User(int Id);
public class App { public Task Run() { return Task.CompletedTask; } }
public const int Limit = 1;
`,
    expectedByKind: { imports: ["using System"], comments: ["// csharp comment"], interfaces: ["interface IService"], types: ["record User", "class App"], signatures: ["Run()"], variables: ["Limit"] },
  },
  cpp: {
    file: "coverage.cpp",
    source: `#include <vector>
// cpp comment
struct User { int id; };
int add(int a, int b) { return a + b; }
static int LIMIT = 4;
`,
    expectedByKind: { imports: ["#include"], comments: ["// cpp comment"], types: ["struct User"], signatures: ["int add"], variables: ["LIMIT"] },
  },
  ruby: {
    file: "coverage.rb",
    source: `require 'json'
# ruby comment
module Demo
class User
  def name
    'x'
  end
end
end
LIMIT = 1
`,
    expectedByKind: { imports: ["require"], comments: ["# ruby comment"], types: ["module Demo", "class User"], signatures: ["def name"], variables: ["LIMIT"] },
  },
  php: {
    file: "coverage.php",
    source: `<?php
namespace Demo;
use DateTime;
// php comment
interface Service {}
class App { public function run() {} }
const LIMIT = 1;
`,
    expectedByKind: { imports: ["namespace Demo", "use DateTime"], comments: ["// php comment"], interfaces: ["interface Service"], types: ["class App"], signatures: ["function run"], variables: ["const LIMIT"] },
  },
  swift: {
    file: "coverage.swift",
    source: `import Foundation
// swift comment
protocol Service {}
struct User { let id: Int }
func greet(name: String) -> String { name }
let answer = 42
`,
    expectedByKind: { imports: ["import Foundation"], comments: ["// swift comment"], interfaces: ["protocol Service"], types: ["struct User"], signatures: ["func greet"], variables: ["let answer"] },
  },
  dart: {
    file: "coverage.dart",
    source: `import 'dart:io';
// dart comment
class User {}
typedef Mapper = String Function(int);
String greet() { return 'x'; }
final answer = 42;
`,
    expectedByKind: { imports: ["import"], comments: ["// dart comment"], types: ["class User", "typedef Mapper"], signatures: ["greet"], variables: ["final answer"] },
  },
  scala: {
    file: "coverage.scala",
    source: `package demo
import scala.concurrent.*
// scala comment
trait Service
case class User(id: Int)
def greet(name: String) = name
val answer = 42
`,
    expectedByKind: { imports: ["import scala"], comments: ["// scala comment"], interfaces: ["trait Service"], types: ["case class User"], signatures: ["def greet"], variables: ["val answer"] },
  },
  r: {
    file: "coverage.R",
    source: `library(dplyr)
# r comment
fit <- function(x) { x }
VALUE <- 1
`,
    expectedByKind: { imports: ["library"], comments: ["# r comment"], signatures: ["fit <- function"], variables: ["VALUE"] },
  },
  lua: {
    file: "coverage.lua",
    source: `local json = require('json')
-- lua comment
function greet(name) return name end
local value = 1
`,
    expectedByKind: { imports: ["require"], comments: ["-- lua comment"], signatures: ["function greet"], variables: ["local value"] },
  },
  perl: {
    file: "coverage.pm",
    source: `package App;
use strict;
# perl comment
sub run { return 1 }
my $value = 1;
`,
    expectedByKind: { imports: ["package App", "use strict"], comments: ["# perl comment"], signatures: ["sub run"], variables: ["my $value"] },
  },
  shell: {
    file: "coverage.sh",
    source: `source ./env.sh
# shell comment
export NAME=demo
run() { echo hi; }
`,
    expectedByKind: { imports: ["source ./env.sh"], comments: ["# shell comment"], signatures: ["run()"], variables: ["export NAME"] },
  },
  sql: {
    file: "coverage.sql",
    source: `-- sql comment
CREATE TABLE users (id int);
CREATE TYPE mood AS ENUM ('ok');
CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$;
WITH recent AS (SELECT 1) SELECT * FROM recent;
`,
    expectedByKind: { comments: ["-- sql comment"], "sql:schema": ["CREATE TABLE", "CREATE FUNCTION"], types: ["CREATE TYPE"], signatures: ["CREATE FUNCTION"], variables: ["WITH recent"] },
  },
  css: {
    file: "coverage.css",
    source: `/* css comment */
:root { --brand: red; }
--local-var: blue;
.card { color: red; }
@media screen { .x { } }
`,
    expectedByKind: { comments: ["/* css comment */"], "css:rules": [":root", ".card", "@media"], variables: ["--local-var"] },
  },
  data: {
    file: "coverage.yaml",
    source: `# data comment
name: demo
version: 1
[tool]
`,
    expectedByKind: { comments: ["# data comment"], "data:keys": ["name: demo", "version: 1", "[tool]"] },
  },
  html: {
    file: "coverage.vue",
    source: `<!-- html comment -->
<template><main id="app"></main></template>
<script src="app.js"></script>
<Widget />
`,
    expectedByKind: { comments: ["<!-- html comment -->"], "html:landmarks": ["<template", "<script", "<Widget"], imports: ["<script src"] },
  },
};

describe("showsignature core — language coverage matrix", () => {
  test("has a fixture for every registered language", () => {
    const registry = buildDefaultRegistry();
    expect(Object.keys(LANGUAGE_COVERAGE_CASES).sort()).toEqual([...registry.supportedLanguages()].sort());
  });

  test("every advertised extension resolves to its adapter language", () => {
    const registry = buildDefaultRegistry();
    for (const metadata of registry.listAdapterMetadata()) {
      for (const extension of metadata.extensions) {
        expect(registry.inferFromFile(`fixture${extension}`)).toBe(metadata.id);
      }
    }
  });

  for (const [lang, item] of Object.entries(LANGUAGE_COVERAGE_CASES)) {
    test(`${lang} fixture covers expected extractor kinds`, () => {
      const registry = buildDefaultRegistry();
      const adapter = registry.get(lang)!;
      expect(adapter).toBeDefined();
      const expectedKinds = Object.keys(item.expectedByKind);
      expect(expectedKinds.sort()).toEqual([...adapter.extractors.keys()].sort());
      const result = extractFromSource({
        adapter,
        filePath: item.file,
        source: item.source,
        extractOrder: expectedKinds as any[],
      });
      expect(result.warnings).toEqual([]);
      const text = resultText(result);
      for (const snippets of Object.values(item.expectedByKind)) {
        for (const snippet of snippets) expect(text).toContain(snippet);
      }
    });
  }
});

// ------------------------------------------------------------------
// Core — mainstream broad adapter smoke tests
// ------------------------------------------------------------------
describe("showsignature core — mainstream language smoke tests", () => {
  const cases: Array<{ lang: string; file: string; source: string; expected: string[]; kinds?: any[] }> = [
    { lang: "java", file: "UserService.java", source: "package demo;\nimport java.util.*;\npublic interface Service {}\npublic class UserService { public String name() { return \"x\"; } }", expected: ["import java", "interface Service", "class UserService"] },
    { lang: "kotlin", file: "Main.kt", source: "package demo\nimport kotlin.collections.*\ndata class User(val id: Int)\nfun greet(name: String): String = name", expected: ["import kotlin", "data class User", "fun greet"] },
    { lang: "csharp", file: "App.cs", source: "using System;\npublic interface IService {}\npublic record User(int Id);\npublic class App { public Task Run() { return Task.CompletedTask; } }", expected: ["using System", "interface IService", "record User", "Run"] },
    { lang: "cpp", file: "lib.cpp", source: "#include <vector>\nstruct User { int id; };\nint add(int a, int b) { return a + b; }\nstatic int LIMIT = 4;", expected: ["#include", "struct User", "int add", "LIMIT"] },
    { lang: "ruby", file: "app.rb", source: "require 'json'\nmodule Demo\nclass User\n  def name\n    'x'\n  end\nend\nend\nLIMIT = 1", expected: ["require", "module Demo", "class User", "def name", "LIMIT"] },
    { lang: "php", file: "app.php", source: "<?php\nnamespace Demo;\nuse DateTime;\ninterface Service {}\nclass App { public function run() {} }\nconst LIMIT = 1;", expected: ["namespace Demo", "use DateTime", "interface Service", "class App", "function run"] },
    { lang: "swift", file: "App.swift", source: "import Foundation\nprotocol Service {}\nstruct User { let id: Int }\nfunc greet(name: String) -> String { name }", expected: ["import Foundation", "protocol Service", "struct User", "func greet"] },
    { lang: "dart", file: "app.dart", source: "import 'dart:io';\nclass User {}\ntypedef Mapper = String Function(int);\nString greet() { return 'x'; }", expected: ["import", "class User", "typedef Mapper", "greet"] },
    { lang: "scala", file: "App.scala", source: "package demo\nimport scala.concurrent.*\ntrait Service\ncase class User(id: Int)\ndef greet(name: String) = name", expected: ["import scala", "trait Service", "case class User", "def greet"] },
    { lang: "r", file: "app.R", source: "library(dplyr)\nfit <- function(x) { x }\nVALUE <- 1", expected: ["library", "fit <- function", "VALUE"] },
    { lang: "lua", file: "app.lua", source: "local json = require('json')\nfunction greet(name) return name end\nlocal value = 1", expected: ["require", "function greet", "local value"] },
    { lang: "perl", file: "App.pm", source: "package App;\nuse strict;\nsub run { return 1 }\nmy $value = 1;", expected: ["package App", "use strict", "sub run", "my $value"] },
    { lang: "shell", file: "script.sh", source: "source ./env.sh\nexport NAME=demo\nrun() { echo hi; }", expected: ["source ./env.sh", "export NAME", "run()"] },
    { lang: "sql", file: "schema.sql", source: "CREATE TABLE users (id int);\nCREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$;", expected: ["CREATE TABLE", "CREATE FUNCTION"], kinds: ["sql:schema", "signatures"] },
    { lang: "css", file: "style.css", source: ":root { --brand: red; }\n.card { color: red; }\n@media screen { .x { } }", expected: [":root", ".card", "@media"], kinds: ["css:rules", "variables"] },
    { lang: "data", file: "config.yaml", source: "name: demo\nversion: 1\n", expected: ["name: demo", "version: 1"], kinds: ["data:keys"] },
    { lang: "html", file: "App.vue", source: "<template><main id=\"app\"></main></template>\n<script src=\"app.js\"></script>", expected: ["<template", "<script"], kinds: ["html:landmarks", "imports"] },
  ];

  for (const item of cases) {
    test(`extracts ${item.lang}`, () => {
      const registry = buildDefaultRegistry();
      const adapter = registry.get(item.lang)!;
      const result = extractFromSource({
        adapter,
        filePath: item.file,
        source: item.source,
        extractOrder: item.kinds ?? ["imports", "signatures", "interfaces", "types", "variables", "comments"],
      });
      const text = result.entries.map((e) => e.lines.join("\n")).join("\n");
      for (const expected of item.expected) expect(text).toContain(expected);
    });
  }

  test("scanner adapters keep signatures compact instead of dumping bodies", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("java")!;
    const result = extractFromSource({
      adapter,
      filePath: "Secret.java",
      source: `public class Secret {
  public String token() {
    return "SUPER_SECRET_TOKEN";
  }
}
`,
      extractOrder: ["types", "signatures"],
    });
    const text = result.entries.map((e) => e.lines.join("\n")).join("\n");
    expect(text).toContain("public class Secret");
    expect(text).not.toContain("SUPER_SECRET_TOKEN");
  });

  test("comment extraction ignores markers inside strings", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("java")!;
    const result = extractFromSource({
      adapter,
      filePath: "Url.java",
      source: `class Url { String value = "https://example.com"; // real comment\n }`,
      extractOrder: ["comments"],
    });
    const text = result.entries.map((e) => e.lines.join("\n")).join("\n");
    expect(text).toContain("// real comment");
    expect(text).not.toContain("//example.com");
  });

  test("comment extraction separates block comments from trailing line comments", () => {
    const registry = buildDefaultRegistry();
    const adapter = registry.get("java")!;
    const result = extractFromSource({
      adapter,
      filePath: "Comments.java",
      source: `class Comments { /* block // not line */ // trailing\n }`,
      extractOrder: ["comments"],
    });
    const lines = result.entries.map((e) => e.lines.join("\n"));
    expect(lines).toContain("/* block // not line */");
    expect(lines).toContain("// trailing");
    expect(lines).not.toContain("// not line */ // trailing");
  });
});

// ------------------------------------------------------------------
// Core — formatting
// ------------------------------------------------------------------
describe("showsignature core — formatting", () => {
  const sections = [
    {
      filePath: "/tmp/demo.ts",
      lang: "ts",
      entries: [
        { kind: "signatures" as const, lines: ["function add(a: number, b: number): number;"], metadata: { sourceLine: 3 } },
        { kind: "imports" as const, lines: ['import { x } from "y";'], metadata: { sourceLine: 1 } },
      ],
      warnings: [],
    },
  ];

  test("formatPlainOutput with line numbers", () => {
    const out = formatPlainOutput(sections, { includeLineNumbers: true });
    expect(out).toContain("// ");
    expect(out).toContain("demo.ts");
    expect(out).toContain("3 function add");
    expect(out).toContain("1 import");
  });

  test("formatPlainOutput without line numbers", () => {
    const out = formatPlainOutput(sections, { includeLineNumbers: false });
    expect(out).toContain("function add");
    expect(out).not.toContain("3 function add");
  });

  test("formatFinalOutput markdown wrapping", () => {
    const registry = buildDefaultRegistry();
    const out = formatFinalOutput({
      registry,
      sections,
      seenLangs: ["ts"],
      outputPath: "out.md",
      includeLineNumbers: false,
    });
    expect(out.startsWith("```ts\n")).toBe(true);
    expect(out.endsWith("\n```")).toBe(true);
  });
});

// ------------------------------------------------------------------
// Core — merging
// ------------------------------------------------------------------
describe("showsignature core — entry merging", () => {
  test("mergeAndSortEntries sorts by pos", () => {
    const entries = [
      [{ kind: "imports", lines: ["a"], pos: 10 }],
      [{ kind: "signatures", lines: ["b"], pos: 5 }],
    ];
    const merged = mergeAndSortEntries(entries);
    expect(merged[0].kind).toBe("signatures");
    expect(merged[1].kind).toBe("imports");
  });

  test("stripCombinedPositions removes pos", () => {
    const combined = [{ kind: "signatures" as const, lines: ["x"], pos: 5, metadata: { sourceLine: 2 } }];
    const stripped = stripCombinedPositions(combined);
    expect("pos" in stripped[0]).toBe(false);
    expect(stripped[0].metadata?.sourceLine).toBe(2);
  });
});

// ------------------------------------------------------------------
// Core — file discovery
// ------------------------------------------------------------------
describe("showsignature core — file discovery", () => {
  test("discovers supported files in temp dir", async () => {
    await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.writeFile(`${dir}/a.ts`, "export const a = 1;", "utf8");
      await fs.writeFile(`${dir}/b.py`, "def b(): pass\n", "utf8");
      await fs.writeFile(`${dir}/readme.md`, "# Hi", "utf8");
      await fs.mkdir(`${dir}/node_modules`, { recursive: true });
      await fs.writeFile(`${dir}/node_modules/x.ts`, "// ignored", "utf8");

      const registry = buildDefaultRegistry();
      const files = await discoverFiles({ registry, folder: dir });
      const basenames = files.map((f) => f.replace(`${dir}/`, "")).sort();
      expect(basenames).toEqual(["a.ts", "b.py", "readme.md"]);
    });
  });

  test("ignores test files by default", async () => {
    await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.writeFile(`${dir}/a.ts`, "", "utf8");
      await fs.writeFile(`${dir}/a.test.ts`, "", "utf8");

      const registry = buildDefaultRegistry();
      const files = await discoverFiles({ registry, folder: dir });
      expect(files.length).toBe(1);
      expect(files[0]).toContain("a.ts");
    });
  });

  test("maxDepth limits recursion", async () => {
    await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.mkdir(`${dir}/sub`, { recursive: true });
      await fs.writeFile(`${dir}/root.ts`, "", "utf8");
      await fs.writeFile(`${dir}/sub/nested.ts`, "", "utf8");

      const registry = buildDefaultRegistry();
      const shallow = await discoverFiles({ registry, folder: dir, maxDepth: 0 });
      expect(shallow.length).toBe(1);
      expect(shallow[0]).toContain("root.ts");

      const deep = await discoverFiles({ registry, folder: dir, maxDepth: 1 });
      expect(deep.length).toBe(2);
    });
  });

  test("respects root .gitignore and maxFiles", async () => {
    await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.mkdir(`${dir}/ignored`, { recursive: true });
      await fs.writeFile(`${dir}/.gitignore`, "ignored/\n*.gen.ts\n", "utf8");
      await fs.writeFile(`${dir}/a.ts`, "", "utf8");
      await fs.writeFile(`${dir}/b.ts`, "", "utf8");
      await fs.writeFile(`${dir}/ignored/c.ts`, "", "utf8");
      await fs.writeFile(`${dir}/skip.gen.ts`, "", "utf8");

      const registry = buildDefaultRegistry();
      const files = await discoverFiles({ registry, folder: dir });
      const names = files.map((f) => f.replace(`${dir}/`, "")).sort();
      expect(names).toEqual(["a.ts", "b.ts"]);

      const limited = await discoverFiles({ registry, folder: dir, maxFiles: 1 });
      expect(limited.length).toBe(1);
    });
  });

  test("respects gitignore globstar, anchored patterns, and negation", async () => {
    await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.mkdir(`${dir}/src/nested`, { recursive: true });
      await fs.mkdir(`${dir}/docs/nested`, { recursive: true });
      await fs.writeFile(`${dir}/.gitignore`, "/root-only.ts\nsrc/**/*.gen.ts\n!src/nested/keep.gen.ts\ndocs/**/*.md\n", "utf8");
      await fs.writeFile(`${dir}/root-only.ts`, "", "utf8");
      await fs.writeFile(`${dir}/src/nested/skip.gen.ts`, "", "utf8");
      await fs.writeFile(`${dir}/src/nested/keep.gen.ts`, "", "utf8");
      await fs.writeFile(`${dir}/src/nested/keep.ts`, "", "utf8");
      await fs.writeFile(`${dir}/docs/nested/readme.md`, "# ignored", "utf8");

      const registry = buildDefaultRegistry();
      const files = await discoverFiles({ registry, folder: dir });
      const names = files.map((f) => f.replace(`${dir}/`, "")).sort();
      expect(names).toEqual(["src/nested/keep.gen.ts", "src/nested/keep.ts"]);
    });
  });
});

// ------------------------------------------------------------------
// Extension integration
// ------------------------------------------------------------------
describe("showsignature extension — pi integration", () => {
  test("registers tool", () => {
    const host = createExtensionHost();
    showsignatureExtension(host.api);
    const tool = host.tools.get("showsignature");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("showsignature");
  });

  test("runs on a single ts file", async () => {
    await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.writeFile(`${dir}/sample.ts`, "export function greet(): string { return 'hi'; }\n", "utf8");

      const host = createExtensionHost({ cwd: dir });
      showsignatureExtension(host.api);
      const result = await host.runTool("showsignature", { file: "sample.ts" });
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThanOrEqual(1);
      const text = result.content[0].text;
      expect(text).toContain("function greet");
    });
  });

  test("runs on a folder with show_only", async () => {
    await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.writeFile(`${dir}/a.ts`, "import { x } from 'y';\nexport const a = 1;\n", "utf8");
      await fs.writeFile(`${dir}/b.md`, "# Title\n\nBody\n", "utf8");

      const host = createExtensionHost({ cwd: dir });
      showsignatureExtension(host.api);
      const result = await host.runTool("showsignature", { folder: ".", show_only: "imports,md:headings" });
      const text = result.content[0].text;
      expect(text).toContain("import");
      expect(text).toContain("# Title");
    });
  });

  test("default folder scan suppresses expected unsupported-kind warnings", async () => {
    await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.writeFile(`${dir}/a.ts`, "export function a() { return 1; }\n", "utf8");
      await fs.writeFile(`${dir}/README.md`, "# Title\n", "utf8");

      const host = createExtensionHost({ cwd: dir });
      showsignatureExtension(host.api);
      const result = await host.runTool("showsignature", { folder: "." });
      expect(result.details.warnings).toBe(0);
      expect(result.content[0].text).not.toContain("not supported");
    });
  });

  test("validates numeric scan limits", async () => {
    const host = createExtensionHost();
    showsignatureExtension(host.api);
    await expect(host.runTool("showsignature", { folder: ".", max_files: -1 })).rejects.toThrow("max_files");
    await expect(host.runTool("showsignature", { folder: ".", max_depth: 1.5 })).rejects.toThrow("max_depth");
  });

  test("respects lang_only filter", async () => {
    await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.writeFile(`${dir}/a.ts`, "export const a = 1;\n", "utf8");
      await fs.writeFile(`${dir}/b.py`, "def b(): pass\n", "utf8");

      const host = createExtensionHost({ cwd: dir });
      showsignatureExtension(host.api);
      const result = await host.runTool("showsignature", { folder: ".", lang_only: "py" });
      const text = result.content[0].text;
      expect(text).toContain("def b");
      expect(text).not.toContain("export const a");
    });
  });

  test("capabilities lists multilingual support", async () => {
    const host = createExtensionHost();
    showsignatureExtension(host.api);
    const result = await host.runTool("showsignature", { capabilities: true });
    const text = result.content[0].text;
    expect(text).toContain("rust (.rs)");
    expect(text).toContain("elixir (.ex, .exs");
    expect(text).toContain("latex (.tex, .sty, .cls, .bib)");
    expect(text).toContain("java (.java)");
    expect(text).toContain(".vue");
    expect(text).toContain(".svelte");
    expect(text).toContain(".ipynb");
  });

  test("strict turns unsupported mode warnings into errors", async () => {
    await withTempDir(async (dir) => {
      const fs = await import("node:fs/promises");
      await fs.writeFile(`${dir}/a.py`, "def a(): pass\n", "utf8");
      const host = createExtensionHost({ cwd: dir });
      showsignatureExtension(host.api);
      await expect(host.runTool("showsignature", { file: "a.py", show_only: "interfaces", strict: true })).rejects.toThrow("not supported");
    });
  });
});
