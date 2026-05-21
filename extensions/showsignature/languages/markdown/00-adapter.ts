import type {
  ExtractKind,
  Extractor,
  LanguageAdapter,
  ParseContext,
} from "../../core-types";
import { createMarkdownParseContext } from "./01-context.ts";
import {
  createCodeBlocksExtractor,
  createDocumentExtractor,
  createFrontmatterExtractor,
  createHeadingsExtractor,
  createMdxImportsExtractor,
  createTablesExtractor,
} from "./03-extractors.ts";

export interface CreateMarkdownAdapterOptions {
  id: string;
  extensions: readonly string[];
  fenceLang: string;
}

function buildExtractors(): ReadonlyMap<ExtractKind, Extractor<ParseContext>> {
  const extractors: Extractor<ParseContext>[] = [
    createDocumentExtractor(),
    createHeadingsExtractor(),
    createTablesExtractor(),
    createCodeBlocksExtractor(),
    createFrontmatterExtractor(),
    createMdxImportsExtractor(),
  ];

  return new Map(extractors.map((extractor) => [extractor.kind, extractor]));
}

export function createMarkdownAdapter(
  options: CreateMarkdownAdapterOptions,
): LanguageAdapter<ParseContext> {
  const extractors = buildExtractors();

  return {
    id: options.id,
    extensions: options.extensions,
    fenceLang: options.fenceLang,
    metadata: {
      id: options.id,
      extensions: options.extensions,
      fenceLang: options.fenceLang,
      displayName: "Markdown / MDX",
      parserQuality: "line-scan",
      capabilities: [...extractors.keys()],
    },
    extractors,
    buildContext({
      source,
      filePath,
    }: {
      source: string;
      filePath: string;
    }): ParseContext {
      return createMarkdownParseContext({ source, filePath });
    },
    supportsKind(kind: ExtractKind): boolean {
      return extractors.has(kind);
    },
  };
}
