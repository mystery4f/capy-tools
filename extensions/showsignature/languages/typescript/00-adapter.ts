import type {
  ExtractKind,
  Extractor,
  LanguageAdapter,
  TsParseContext,
} from "../../core-types";
import { createTsParseContext } from "./01-context.ts";
import {
  createCommentsExtractor,
  createImportsExtractor,
  createInterfacesExtractor,
  createSignaturesExtractor,
  createTypesExtractor,
  createVariablesExtractor,
} from "./03-extractors.ts";

export interface CreateTsFamilyAdapterOptions {
  id: string;
  extensions: readonly string[];
  fenceLang: string;
}

function buildExtractors(): ReadonlyMap<
  ExtractKind,
  Extractor<TsParseContext>
> {
  const extractors: Extractor<TsParseContext>[] = [
    createSignaturesExtractor(),
    createInterfacesExtractor(),
    createTypesExtractor(),
    createVariablesExtractor(),
    createCommentsExtractor(),
    createImportsExtractor(),
  ];

  return new Map(extractors.map((extractor) => [extractor.kind, extractor]));
}

export function createTsFamilyAdapter(
  options: CreateTsFamilyAdapterOptions,
): LanguageAdapter<TsParseContext> {
  const extractors = buildExtractors();

  return {
    id: options.id,
    extensions: options.extensions,
    fenceLang: options.fenceLang,
    extractors,
    buildContext({
      source,
      filePath,
    }: {
      source: string;
      filePath: string;
    }): TsParseContext {
      return createTsParseContext({ source, filePath });
    },
    supportsKind(kind: ExtractKind): boolean {
      return extractors.has(kind);
    },
  };
}
