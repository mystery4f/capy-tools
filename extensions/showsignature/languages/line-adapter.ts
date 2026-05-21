import type {
  ExtractEntry,
  ExtractKind,
  Extractor,
  LanguageAdapter,
  LanguageAdapterMetadata,
  ParseContext,
  SingleExtractResult,
} from "../core-types";

interface LineContext extends ParseContext {
  readonly lines: readonly string[];
  readonly lineStarts: readonly number[];
}

export interface LinePattern {
  kind: ExtractKind;
  pattern: RegExp;
  render?: (line: string, match: RegExpMatchArray) => string;
  collect?: "line" | "balanced" | "keyword";
}

export interface CreateLineAdapterOptions {
  id: string;
  extensions: readonly string[];
  fenceLang: string;
  displayName: string;
  parserQuality: LanguageAdapterMetadata["parserQuality"];
  patterns: readonly LinePattern[];
  lineComment?: string;
  blockComment?: { start: string; end: string };
  keywordEnd?: string;
  metadata?: Partial<LanguageAdapterMetadata>;
}

function toLines(source: string): string[] {
  return source.length === 0 ? [""] : source.split(/\r?\n/u);
}

function toLineStarts(source: string, lines: readonly string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length;
    if (source.slice(offset, offset + 2) === "\r\n") offset += 2;
    else if (source[offset] === "\n") offset += 1;
  }
  return starts;
}

function toResult(entries: ExtractEntry[]): SingleExtractResult {
  return { entries, warnings: [] };
}

function toEntry(kind: ExtractKind, lines: string[], sourcePos: number, filePath: string): ExtractEntry {
  return { kind, lines, metadata: { filePath, sourcePos } };
}

function stripInlineComment(line: string, marker?: string): string {
  const index = findMarkerOutsideQuotes(line, marker);
  return index < 0 ? line.trimEnd() : line.slice(0, index).trimEnd();
}

function findMarkerOutsideQuotes(line: string, marker?: string, startAt = 0): number {
  if (!marker) return -1;
  let quote: string | null = null;
  let escaped = false;
  for (let i = startAt; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (line.startsWith(marker, i)) return i;
  }
  return -1;
}

function balancedDelta(line: string): number {
  let delta = 0;
  let quote: string | null = null;
  let escaped = false;
  for (const ch of line) {
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") delta += 1;
    if (ch === "}" || ch === ")" || ch === "]") delta -= 1;
  }
  return delta;
}

function collectLines(context: LineContext, startLine: number, pattern: LinePattern, options: CreateLineAdapterOptions): string[] {
  const first = context.lines[startLine] ?? "";
  if (pattern.collect === "line" || !pattern.collect) return [first.trimEnd()];

  const out: string[] = [];
  let depth = 0;
  let keywordDepth = 0;
  for (let index = startLine; index < context.lines.length; index += 1) {
    const line = context.lines[index] ?? "";
    const cleaned = stripInlineComment(line, options.lineComment);
    out.push(line.trimEnd());
    if (pattern.collect === "balanced") {
      depth += balancedDelta(cleaned);
      if (index > startLine && depth <= 0) break;
      if (index === startLine && depth <= 0 && /[;:]?\s*$/u.test(cleaned.trim())) break;
    } else if (pattern.collect === "keyword") {
      const trimmed = cleaned.trim();
      if (/\bdo\b/u.test(trimmed)) keywordDepth += 1;
      if (new RegExp(`^${options.keywordEnd ?? "end"}\\b`, "u").test(trimmed)) keywordDepth -= 1;
      if (index > startLine && keywordDepth <= 0) break;
      if (index === startLine && keywordDepth <= 0) break;
    }
    if (out.length >= 80) break;
  }
  return out;
}

function compactLines(lines: readonly string[]): string[] {
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.trimEnd());
}

function createPatternExtractor(options: CreateLineAdapterOptions, kind: ExtractKind, patterns: readonly LinePattern[]): Extractor<LineContext> {
  return {
    kind,
    extract(context): SingleExtractResult {
      const entries: ExtractEntry[] = [];
      for (let lineIndex = 0; lineIndex < context.lines.length; lineIndex += 1) {
        const raw = context.lines[lineIndex] ?? "";
        const candidate = stripInlineComment(raw, options.lineComment).trimStart();
        if (!candidate) continue;
        for (const pattern of patterns) {
          const match = candidate.match(pattern.pattern);
          if (!match) continue;
          const collected = collectLines(context, lineIndex, pattern, options);
          const rendered = pattern.render ? [pattern.render(candidate, match)] : compactLines(collected);
          if (rendered.length === 0) continue;
          const start = context.lineStarts[lineIndex] ?? 0;
          const indent = raw.length - raw.trimStart().length;
          entries.push(toEntry(kind, rendered, start + indent, context.filePath));
          break;
        }
      }
      return toResult(entries);
    },
  };
}

function createCommentsExtractor(options: CreateLineAdapterOptions): Extractor<LineContext> {
  return {
    kind: "comments",
    extract(context): SingleExtractResult {
      const entries: ExtractEntry[] = [];
      let inBlock = false;
      let blockLines: string[] = [];
      let blockStart = 0;
      let blockLine = 0;
      for (let lineIndex = 0; lineIndex < context.lines.length; lineIndex += 1) {
        const line = context.lines[lineIndex] ?? "";
        if (inBlock && options.blockComment) {
          const end = findMarkerOutsideQuotes(line, options.blockComment.end);
          if (end < 0) {
            blockLines.push(line);
            continue;
          }
          blockLines.push(line.slice(0, end + options.blockComment.end.length));
          entries.push(toEntry("comments", blockLines, (context.lineStarts[blockLine] ?? 0) + blockStart, context.filePath));
          inBlock = false;
          blockLines = [];
          continue;
        }
        let lineCommentSearchStart = 0;
        if (options.blockComment) {
          const start = findMarkerOutsideQuotes(line, options.blockComment.start);
          if (start >= 0) {
            const end = findMarkerOutsideQuotes(line, options.blockComment.end, start + options.blockComment.start.length);
            if (end >= 0) {
              entries.push(toEntry("comments", [line.slice(start, end + options.blockComment.end.length)], (context.lineStarts[lineIndex] ?? 0) + start, context.filePath));
              lineCommentSearchStart = end + options.blockComment.end.length;
            } else {
              inBlock = true;
              blockStart = start;
              blockLine = lineIndex;
              blockLines = [line.slice(start)];
              continue;
            }
          }
        }
        if (options.lineComment) {
          const index = findMarkerOutsideQuotes(line, options.lineComment, lineCommentSearchStart);
          if (index >= 0) entries.push(toEntry("comments", [line.slice(index)], (context.lineStarts[lineIndex] ?? 0) + index, context.filePath));
        }
      }
      return toResult(entries);
    },
  };
}

export function createLineAdapter(options: CreateLineAdapterOptions): LanguageAdapter<LineContext> {
  const kinds = new Map<ExtractKind, LinePattern[]>();
  for (const pattern of options.patterns) {
    kinds.set(pattern.kind, [...(kinds.get(pattern.kind) ?? []), pattern]);
  }
  const extractors: Extractor<LineContext>[] = [...kinds.entries()].map(([kind, patterns]) => createPatternExtractor(options, kind, patterns));
  if (options.lineComment || options.blockComment) extractors.push(createCommentsExtractor(options));
  const extractorMap = new Map(extractors.map((extractor) => [extractor.kind, extractor]));

  return {
    id: options.id,
    extensions: options.extensions,
    fenceLang: options.fenceLang,
    metadata: {
      id: options.id,
      extensions: options.extensions,
      fenceLang: options.fenceLang,
      displayName: options.displayName,
      parserQuality: options.parserQuality,
      capabilities: [...extractorMap.keys()],
      ...options.metadata,
    },
    extractors: extractorMap,
    buildContext({ source, filePath }): LineContext {
      const lines = toLines(source);
      return { source, filePath, lines, lineStarts: toLineStarts(source, lines) };
    },
    supportsKind(kind: ExtractKind): boolean {
      return extractorMap.has(kind);
    },
  };
}
