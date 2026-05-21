import type { ExtractEntry, ExtractKind, Extractor, LanguageAdapter, ParseContext, SingleExtractResult } from "../core-types";
import { createLineAdapter } from "./line-adapter";

const p = (kind: string, pattern: RegExp, collect: "line" | "balanced" = "balanced") => ({ kind: kind as ExtractKind, pattern, collect });
const BIB_KIND = "bib:entries" as ExtractKind;

function toEntry(kind: ExtractKind, lines: string[], sourcePos: number, filePath: string): ExtractEntry {
  return { kind, lines, metadata: { filePath, sourcePos } };
}

function bibExtractor(): Extractor<ParseContext> {
  return {
    kind: BIB_KIND,
    extract(context): SingleExtractResult {
      const entries: ExtractEntry[] = [];
      const pattern = /@(\w+)\s*\{\s*([^,\s]+)\s*,/gu;
      for (const match of context.source.matchAll(pattern)) {
        entries.push(toEntry(BIB_KIND, [`@${match[1]}{${match[2]}, ...}`], match.index ?? 0, context.filePath));
      }
      return { entries, warnings: [] };
    },
  };
}

export function createLatexAdapter(): LanguageAdapter {
  const adapter = createLineAdapter({
    id: "latex",
    extensions: [".tex", ".sty", ".cls", ".bib"],
    fenceLang: "tex",
    displayName: "LaTeX / TeX / BibTeX",
    parserQuality: "balanced-scan",
    lineComment: "%",
    patterns: [
      p("sections", /^\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\b/u),
      p("imports", /^\\(?:documentclass|usepackage|input|include|bibliography|addbibresource)\b/u),
      p("tex:commands", /^\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator|newenvironment|renewenvironment)\b/u),
      p("types", /^\\(?:newtheorem|newenvironment|renewenvironment)\b/u),
      p("variables", /^\\(?:title|author|date|subject|keywords)\b/u),
      p("tex:labels", /^\\(?:label|ref|eqref|cite|autoref|cref|Cref)\b/u, "line"),
    ],
    metadata: { capabilities: ["sections", "imports", "tex:commands", "types", "variables", "tex:labels", "comments", BIB_KIND] as ExtractKind[] },
  });
  const extractors = new Map(adapter.extractors as ReadonlyMap<ExtractKind, Extractor<ParseContext>>);
  extractors.set(BIB_KIND, bibExtractor());
  return { ...adapter, extractors };
}
