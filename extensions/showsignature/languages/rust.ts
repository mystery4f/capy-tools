import type { ExtractKind, LanguageAdapter } from "../core-types";
import { createLineAdapter } from "./line-adapter";

const p = (kind: string, pattern: RegExp, collect: "line" | "balanced" = "line") => ({ kind: kind as ExtractKind, pattern, collect });

export function createRustAdapter(): LanguageAdapter {
  return createLineAdapter({
    id: "rust",
    extensions: [".rs"],
    fenceLang: "rust",
    displayName: "Rust",
    parserQuality: "line-scan",
    lineComment: "//",
    blockComment: { start: "/*", end: "*/" },
    patterns: [
      p("imports", /^(?:pub\s+)?(?:use|mod|extern\s+crate)\b/u, "line"),
      p("signatures", /^(?:pub\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]+"\s+)?fn\s+[A-Za-z_][A-Za-z0-9_]*\b/u),
      p("signatures", /^(?:pub\s+)?macro_rules!\s+[A-Za-z_][A-Za-z0-9_]*\b/u),
      p("signatures", /^(?:pub\s+)?impl\b/u),
      p("interfaces", /^(?:pub\s+)?(?:unsafe\s+)?trait\s+[A-Za-z_][A-Za-z0-9_]*\b/u),
      p("types", /^(?:pub\s+)?(?:struct|enum|union|type)\s+[A-Za-z_][A-Za-z0-9_]*\b/u),
      p("types", /^(?:pub\s+)?(?:unsafe\s+)?trait\s+[A-Za-z_][A-Za-z0-9_]*\b/u),
      p("variables", /^(?:pub\s+)?(?:const|static)\s+[A-Za-z_][A-Za-z0-9_]*\b/u, "line"),
    ],
  });
}
