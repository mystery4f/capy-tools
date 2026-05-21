import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { canGroupTool, renderGroupedToolCall, renderGroupedToolResult, summarizeToolCall } from "./basic-tool-grouping.ts";
import { resolve } from "node:path";

import {
  buildDefaultRegistry,
  discoverFiles,
  formatFinalOutput,
  formatPlainOutput,
  listSupportedExtractKinds,
  parseExtractOptions,
  runPipeline,
  type ExtractKind,
  type LanguageRegistry,
  type PipelineResult,
} from "./showsignature/index";

const showsignatureSchema = Type.Object({
  file: Type.Optional(Type.String({ description: "Inspect a single file path" })),
  folder: Type.Optional(Type.String({ description: "Inspect a folder path (default: current working directory)" })),
  show_only: Type.Optional(Type.String({ description: "Comma-separated extract kinds or aliases. Use capabilities=true to list all supported kinds." })),
  lang_only: Type.Optional(Type.String({ description: "Only process files for a language id or extension. Use capabilities=true to list supported languages." })),
  include_tests: Type.Optional(Type.Boolean({ description: "Include test directories during discovery (default: false)" })),
  max_depth: Type.Optional(Type.Integer({ minimum: 0, description: "Maximum folder scan depth (default: unlimited)" })),
  ignore_folder: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())], { description: "Folder name(s) to ignore during discovery" })),
  line_number: Type.Optional(Type.Boolean({ description: "Prefix entries with source line numbers (default: true)" })),
  output_markdown: Type.Optional(Type.Boolean({ description: "Wrap output in a markdown code block (default: false)" })),
  capabilities: Type.Optional(Type.Boolean({ description: "List supported languages, extensions, parser quality, and extract kinds instead of scanning files" })),
  strict: Type.Optional(Type.Boolean({ description: "Treat unsupported requested extract kinds as errors instead of warnings" })),
  max_files: Type.Optional(Type.Integer({ minimum: 0, description: "Maximum number of files to scan" })),
  include_hidden: Type.Optional(Type.Boolean({ description: "Include dotfiles and hidden directories except .git (default: false)" })),
});

function safeKeyHint(keybinding: string, description: string): string {
  try {
    return keyHint(keybinding, description);
  } catch {
    return `(${description})`;
  }
}

function renderShowsignatureResult(result: any, { expanded, isPartial }: { expanded?: boolean; isPartial?: boolean }, theme: any) {
  if (isPartial) return new Text(theme.fg("warning", "Analyzing code structure..."), 0, 0);
  const details = result.details as { displayPath?: string; sectionCount?: number } | undefined;
  if (!details) return new Text(theme.fg("accent", "Show signature"), 0, 0);
  const hint = safeKeyHint("app.tools.expand", "to expand");
  return new Text(theme.fg("accent", `Show signature ${details.displayPath ?? ""}`) + theme.fg("muted", `\n${hint}`), 0, 0);
}

function ensureStringArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function optionalNonNegativeInteger(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

export default function showsignatureExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "showsignature",
    label: "showsignature",
    description:
      "Extract compact structural signatures from source files and Markdown: functions, classes, methods, imports, types, interfaces, variables, comments, headings, tables, and code blocks. Use it to understand a codebase quickly without implementation noise.",
    promptSnippet: "Extract signatures and structure from source files or Markdown",
    promptGuidelines: [
      "Use showsignature before read_block when you need the shape of a file, not its full contents.",
      "Combine show_only modes to get exactly the structural slices you need (e.g., signatures+imports).",
      "Use lang_only to restrict a folder scan to a single language.",
    ],
    parameters: showsignatureSchema,
    renderShell: "self",
    renderCall(args, theme, context) {
      return renderGroupedToolCall("showsignature", args, theme, context, summarizeToolCall("showsignature", args));
    },
    renderResult(result, options, theme, context) {
      if (options.expanded || !canGroupTool(context)) return renderShowsignatureResult(result, options, theme);
      return renderGroupedToolResult("showsignature", result, options, theme, context);
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const registry = buildDefaultRegistry();
      if (params.capabilities) {
        const lines = registry.listAdapterMetadata().map((metadata) => {
          const capabilities = metadata.capabilities?.length ? metadata.capabilities.join(",") : [...(registry.get(metadata.id)?.extractors.keys() ?? [])].join(",");
          return `- ${metadata.id} (${metadata.extensions.join(", ")}) [${metadata.parserQuality ?? "unknown"}]: ${capabilities}`;
        });
        return {
          content: [{ type: "text" as const, text: [`Supported showsignature languages:`, ...lines].join("\n") }],
          details: { languages: registry.listAdapterMetadata() },
        };
      }

      const allKinds = new Set<ExtractKind>(listSupportedExtractKinds(registry));

      const rawLang = params.lang_only?.trim();
      const explicitLang = rawLang ? resolveLanguageId(registry, rawLang) : undefined;

      if (rawLang && !explicitLang) {
        throw new Error(`${rawLang} not supported`);
      }

      const extractOrder = params.show_only
        ? parseExtractOptions(params.show_only, [...allKinds])
        : (["signatures"] as ExtractKind[]);
      const warnUnsupportedKinds = params.show_only !== undefined;
      const maxDepth = optionalNonNegativeInteger(params.max_depth, "max_depth");
      const maxFiles = optionalNonNegativeInteger(params.max_files, "max_files");

      const targetPath = params.file
        ? resolve(ctx.cwd, params.file)
        : params.folder
          ? resolve(ctx.cwd, params.folder)
          : ctx.cwd;

      const files = await discoverFiles({
        registry,
        ...(params.file ? { file: targetPath } : { folder: targetPath }),
        includeTests: params.include_tests ?? false,
        ignoreFolders: ensureStringArray(params.ignore_folder),
        ...(maxDepth !== undefined ? { maxDepth } : {}),
        ...(maxFiles !== undefined ? { maxFiles } : {}),
        includeHidden: params.include_hidden ?? false,
      });

      const filteredFiles = explicitLang
        ? files.filter((f) => registry.inferFromFile(f) === explicitLang)
        : files;

      let result: PipelineResult;
      if (filteredFiles.length === 0) {
        result = { success: true, sections: [], diagnostics: { warnings: [], errors: [] }, meta: { seenLangs: [] } };
      } else {
        result = await runPipeline({
          registry,
          files: filteredFiles,
          ...(explicitLang ? { explicitLang } : {}),
          extractOrder,
          warnUnsupportedKinds,
        });
      }

      const plain = formatPlainOutput(result.sections, {
        includeLineNumbers: params.line_number !== false,
        redact: true,
      });

      const text = params.output_markdown
        ? formatFinalOutput({
            registry,
            sections: result.sections,
            seenLangs: result.meta.seenLangs,
            ...(explicitLang ? { explicitLang } : {}),
            includeLineNumbers: params.line_number !== false,
            redact: true,
          })
        : plain;

      if (params.strict && result.diagnostics.warnings.length > 0) {
        throw new Error(result.diagnostics.warnings.map((w) => w.message).join("\n"));
      }

      const warnings = result.diagnostics.warnings.length > 0
        ? result.diagnostics.warnings.map((w) => `[warning] ${w.filePath ?? ""}: ${w.message}`).join("\n")
        : "";
      const errors = result.diagnostics.errors.length > 0
        ? result.diagnostics.errors.map((e) => `[error] ${e.filePath ?? ""}: ${e.message}`).join("\n")
        : "";
      const diagnostics = [warnings, errors].filter(Boolean).join("\n");

      return {
        content: [{ type: "text" as const, text: text + (diagnostics ? `\n\n${diagnostics}` : "") }],
        details: {
          displayPath: params.file ?? params.folder ?? ".",
          sectionCount: result.sections.length,
          totalEntries: result.sections.reduce((sum, s) => sum + s.entries.length, 0),
          warnings: result.diagnostics.warnings.length,
          errors: result.diagnostics.errors.length,
        },
      };
    },
  });
}

function resolveLanguageId(registry: LanguageRegistry, rawLang: string): string | undefined {
  const normalized = rawLang.trim().toLowerCase();
  if (!normalized) return undefined;
  if (registry.has(normalized)) return normalized;
  const extension = normalized.startsWith(".") ? normalized : `.${normalized}`;
  for (const metadata of registry.listAdapterMetadata()) {
    if (metadata.extensions.some((candidate) => candidate.toLowerCase() === extension)) {
      return metadata.id;
    }
  }
  return undefined;
}
