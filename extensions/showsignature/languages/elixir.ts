import type { ExtractKind, LanguageAdapter } from "../core-types";
import { createLineAdapter } from "./line-adapter";

const p = (kind: string, pattern: RegExp, collect: "line" | "keyword" = "line") => ({ kind: kind as ExtractKind, pattern, collect });

export function createElixirAdapter(): LanguageAdapter {
  return createLineAdapter({
    id: "elixir",
    extensions: [".ex", ".exs", ".heex", ".leex", ".eex"],
    fenceLang: "elixir",
    displayName: "Elixir",
    parserQuality: "line-scan",
    lineComment: "#",
    keywordEnd: "end",
    patterns: [
      p("imports", /^(?:alias|import|require|use)\b/u, "line"),
      p("signatures", /^defmodule\s+[A-Z][A-Za-z0-9_.]*(?:\s+do)?/u),
      p("signatures", /^def(?:p|macro|macrop)?\s+[A-Za-z_!?][A-Za-z0-9_!?]*(?:\(|\s)/u),
      p("signatures", /^defprotocol\s+[A-Z][A-Za-z0-9_.]*(?:\s+do)?/u),
      p("signatures", /^defimpl\s+[A-Z][A-Za-z0-9_.]*(?:,|\s)/u),
      p("interfaces", /^@(callback|macrocallback|behaviour)\b/u, "line"),
      p("interfaces", /^defprotocol\s+[A-Z][A-Za-z0-9_.]*(?:\s+do)?/u),
      p("types", /^@(type|typep|opaque)\b/u, "line"),
      p("types", /^defstruct\b/u, "line"),
      p("variables", /^@[A-Za-z_][A-Za-z0-9_]*\b/u, "line"),
    ],
  });
}
