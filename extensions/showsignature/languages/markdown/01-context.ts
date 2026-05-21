import type { ParseContext } from "../../core-types";

export interface CreateMarkdownParseContextOptions {
  source: string;
  filePath: string;
}

export function createMarkdownParseContext(
  options: CreateMarkdownParseContextOptions,
): ParseContext {
  return {
    source: options.source,
    filePath: options.filePath,
  };
}
