// ============================================================================
// Core library — extracted from showsignature v0.1.6
// Removed: CLI layer (commander/globby), stdin handling, output-file writing.
// Kept: registry, pipeline, extractors, formatting, redaction.
// ============================================================================
import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";

import {
  BUILT_IN_EXTRACT_KINDS,
  type AggregatedExtractResult,
  type BuiltInExtractKind,
  type CombinedExtractEntry,
  type DetectFenceLanguageOptions,
  type Diagnostic,
  type DiscoverFilesOptions,
  type ExtractEntry,
  type ExtractFromSourceOptions,
  type ExtractKind,
  type ExtractWarning,
  type FileSection,
  type FormatFinalOutputOptions,
  type LanguageAdapter,
  type LanguageAdapterMetadata,
  type LanguageRegistry,
  type LazyLanguageAdapterRegistration,
  type ParseContext,
  type PipelineError,
  type PipelineResult,
  type ProcessFileOptions,
  type RunPipelineOptions,
} from "./core-types";

import { createGoAdapter } from "./languages/go/00-adapter";
import { createMarkdownAdapter } from "./languages/markdown/00-adapter";
import { createPythonAdapter } from "./languages/python/00-adapter";
import { createTsFamilyAdapter } from "./languages/typescript/00-adapter";
import { createRustAdapter } from "./languages/rust";
import { createElixirAdapter } from "./languages/elixir";
import { createLatexAdapter } from "./languages/latex";
import {
  createCSharpAdapter,
  createCppAdapter,
  createCssAdapter,
  createDartAdapter,
  createDataAdapter,
  createHtmlAdapter,
  createJavaAdapter,
  createKotlinAdapter,
  createLuaAdapter,
  createPerlAdapter,
  createPhpAdapter,
  createRAdapter,
  createRubyAdapter,
  createScalaAdapter,
  createShellAdapter,
  createSqlAdapter,
  createSwiftAdapter,
} from "./languages/broad";

export type { Extractor, LanguageAdapter } from "./core-types";

const DEFAULT_EXTRACT_ORDER: ExtractKind[] = ["signatures"];

// ============================================================================
// Secret redaction
// ============================================================================
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const MARKDOWN_META_PATTERN = /[`<>]/gu;
const REDACTED_SECRET = "[redacted]";
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu;
const GITHUB_TOKEN_PATTERN =
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/gu;
const AWS_ACCESS_KEY_PATTERN = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu;
const SLACK_TOKEN_PATTERN = /\bxox(?:a|b|p|r|s)-[A-Za-z0-9-]{10,}\b/gu;
const PRIVATE_KEY_INLINE_PATTERN =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gu;
const PRIVATE_KEY_BOUNDARY_PATTERN =
  /-----(?:BEGIN|END) [A-Z0-9 ]*PRIVATE KEY-----/gu;
const SECRET_KEYWORD_PATTERN =
  "(?:api[_-]?key|token|secret|password|passwd|credential|private[_-]?key|access[_-]?key|auth)";
const SECRET_NAME_PATTERN = `(?:${SECRET_KEYWORD_PATTERN}|[A-Za-z_][A-Za-z0-9_]*${SECRET_KEYWORD_PATTERN})[A-Za-z0-9_]*`;
const ENV_SECRET_ASSIGNMENT_PATTERN = new RegExp(
  `(^|\\b)(${SECRET_NAME_PATTERN}\\s*=\\s*)([^\\s#;]+)`,
  "giu",
);
const QUOTED_SECRET_PROPERTY_PATTERN = new RegExp(
  `(["']?${SECRET_NAME_PATTERN}["']?\\s*[:=]\\s*)(["'])([^"']+)(\\2)`,
  "giu",
);
const SECRET_VARIABLE_ASSIGNMENT_PATTERN = new RegExp(
  `\\b(${SECRET_NAME_PATTERN}\\s*[:=]\\s*)([^\\s,;)]+)`,
  "giu",
);

export function redactSecrets(value: string): string {
  return value
    .replace(PRIVATE_KEY_INLINE_PATTERN, REDACTED_SECRET)
    .replace(PRIVATE_KEY_BOUNDARY_PATTERN, REDACTED_SECRET)
    .replace(JWT_PATTERN, REDACTED_SECRET)
    .replace(GITHUB_TOKEN_PATTERN, REDACTED_SECRET)
    .replace(AWS_ACCESS_KEY_PATTERN, REDACTED_SECRET)
    .replace(SLACK_TOKEN_PATTERN, REDACTED_SECRET)
    .replace(
      QUOTED_SECRET_PROPERTY_PATTERN,
      (_match, key: string, quote: string, _secret: string, closeQuote: string) =>
        `${key}${quote}${REDACTED_SECRET}${closeQuote}`,
    )
    .replace(
      ENV_SECRET_ASSIGNMENT_PATTERN,
      (_match, prefix: string, key: string) => `${prefix}${key}${REDACTED_SECRET}`,
    )
    .replace(
      SECRET_VARIABLE_ASSIGNMENT_PATTERN,
      (_match, key: string) => `${key}${REDACTED_SECRET}`,
    );
}

function sanitizeAndMaybeRedactForDisplay(value: string, redact = true): string {
  return sanitizeForDisplay(redact ? redactSecrets(value) : value);
}

function sanitizeForDisplay(value: string): string {
  if (
    value.includes("\n") ||
    value.includes("\r") ||
    value.match(ANSI_ESCAPE_PATTERN) ||
    value.match(CONTROL_CHARS_PATTERN)
  ) {
    return "[unsafe text omitted]";
  }
  return value;
}

function sanitizeForMarkdown(value: string): string {
  return sanitizeForDisplay(value).replace(MARKDOWN_META_PATTERN, (char) => `\\${char}`);
}

function normalizeExtractKindToken(token: string): string {
  if (token === "md") return "md:all";
  if (token === "tex") return "sections,tex:commands,tex:labels";
  return token;
}

function isMarkdownExtractKind(kind: ExtractKind): boolean {
  return kind === "md" || kind.startsWith("md:");
}

function usesOnlyMarkdownExtractKinds(kinds: readonly ExtractKind[]): boolean {
  return kinds.length > 0 && kinds.every((kind) => isMarkdownExtractKind(kind));
}

export function listSupportedExtractKinds(registry: LanguageRegistry): ExtractKind[] {
  const kinds = new Set<ExtractKind>(BUILT_IN_EXTRACT_KINDS);
  for (const adapter of registry.listAdapters()) {
    for (const kind of adapter.extractors.keys()) {
      kinds.add(kind);
    }
  }
  return [...kinds];
}

function formatSupportedExtensionsHelp(extensions: readonly string[]): string {
  return [...extensions].sort().join(", ");
}

export function formatUnsupportedFileMessage(filePath: string, registry: LanguageRegistry): string {
  const extension = normalizeExtension(path.extname(filePath));
  const supportedExtensions = formatSupportedExtensionsHelp(registry.supportedExtensions());
  if (extension) {
    return `File is not supported: extension "${extension}" is not supported. Supported extensions: ${supportedExtensions}`;
  }
  return `File is not supported: could not infer a language from the file name. Supported extensions: ${supportedExtensions}`;
}

// ============================================================================
// Config / validation helpers
// ============================================================================
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasStringProp<T extends string>(value: Record<string, unknown>, key: T): value is Record<T, string> {
  return typeof value[key] === "string";
}

function hasNumberProp<T extends string>(value: Record<string, unknown>, key: T): value is Record<T, number> {
  return typeof value[key] === "number";
}

export function parseExtractOptions(rawValue: string, supportedKinds: readonly ExtractKind[]): ExtractKind[] {
  const tokens = rawValue
    .split(",")
    .flatMap((token) => normalizeExtractKindToken(token.trim().toLowerCase()).split(","))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    throw new Error("No extract options were provided");
  }

  const supportedSet = new Set<string>(supportedKinds);
  const selected: ExtractKind[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (!supportedSet.has(token)) {
      const available = [...supportedSet].sort().join(", ");
      throw new Error(`Unsupported extract option: ${token}. Supported options: ${available}`);
    }
    if (seen.has(token)) continue;
    selected.push(token as ExtractKind);
    seen.add(token);
  }

  return selected;
}

export function stringifyError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (isRecord(err) && hasStringProp(err, "message")) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function toDiagnostic(err: unknown, options?: { level?: "warning" | "error"; filePath?: string }): Diagnostic {
  const normalized: Diagnostic = {
    level: options?.level ?? "error",
    message: stringifyError(err),
    cause: err,
  };
  if (options?.filePath) normalized.filePath = options.filePath;
  if (!isRecord(err)) return normalized;
  if (!normalized.filePath && hasStringProp(err, "filePath")) normalized.filePath = err.filePath;
  if (hasStringProp(err, "code")) normalized.code = err.code;
  if (hasNumberProp(err, "exitCode")) normalized.exitCode = err.exitCode;
  if (hasStringProp(err, "kind")) normalized.kind = err.kind as ExtractKind;
  if (hasNumberProp(err, "pos")) normalized.pos = err.pos;
  return normalized;
}

export function toPipelineError(err: unknown, filePath?: string): PipelineError {
  const normalized: PipelineError = { message: stringifyError(err) };
  if (filePath) normalized.filePath = filePath;
  if (!isRecord(err)) return normalized;
  if (!normalized.filePath && hasStringProp(err, "filePath")) normalized.filePath = err.filePath;
  if (hasStringProp(err, "code")) normalized.code = err.code;
  if (hasNumberProp(err, "exitCode")) normalized.exitCode = err.exitCode;
  return normalized;
}

// ============================================================================
// Language Registry
// ============================================================================
function normalizeExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase();
  if (!normalized) return "";
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function adapterToMetadata(adapter: LanguageAdapter): LanguageAdapterMetadata {
  if (adapter.metadata) return adapter.metadata;
  return { id: adapter.id, extensions: adapter.extensions, fenceLang: adapter.fenceLang };
}

function getRegistryMetadata(registry: LanguageRegistry, langId: string): LanguageAdapterMetadata | undefined {
  return registry.listAdapterMetadata().find((metadata) => metadata.id === langId);
}

function resolveLanguageId(registry: LanguageRegistry, rawLang: string): string | undefined {
  const normalized = rawLang.trim().toLowerCase();
  if (!normalized) return undefined;
  if (registry.has(normalized)) return normalized;
  const extension = normalizeExtension(normalized);
  for (const metadata of registry.listAdapterMetadata()) {
    if (metadata.extensions.some((candidate) => normalizeExtension(candidate) === extension)) {
      return metadata.id;
    }
  }
  return undefined;
}

export function createLanguageRegistry(): LanguageRegistry {
  const adapters = new Map<string, LanguageAdapter>();
  const lazyAdapters = new Map<string, LazyLanguageAdapterRegistration>();

  const api: LanguageRegistry = {
    register(adapter: LanguageAdapter): void {
      adapters.set(adapter.id, adapter);
      lazyAdapters.delete(adapter.id);
    },
    registerLazy(registration: LazyLanguageAdapterRegistration): void {
      lazyAdapters.set(registration.id, registration);
      adapters.delete(registration.id);
    },
    unregister(langId: string): boolean {
      const hadEager = adapters.delete(langId);
      const hadLazy = lazyAdapters.delete(langId);
      return hadEager || hadLazy;
    },
    has(langId: string): boolean {
      return adapters.has(langId) || lazyAdapters.has(langId);
    },
    get(langId: string): LanguageAdapter | undefined {
      return adapters.get(langId);
    },
    async getOrLoad(langId: string): Promise<LanguageAdapter | undefined> {
      const existing = adapters.get(langId);
      if (existing) return existing;
      const registration = lazyAdapters.get(langId);
      if (!registration) return undefined;
      const loaded = await registration.load();
      if (loaded.id !== registration.id) {
        throw new Error(`Lazy adapter id mismatch: expected "${registration.id}" but got "${loaded.id}"`);
      }
      api.register(loaded);
      return loaded;
    },
    listAdapters(): readonly LanguageAdapter[] {
      return [...adapters.values()];
    },
    listAdapterMetadata(): readonly LanguageAdapterMetadata[] {
      const eagerMetadata = [...adapters.values()].map(adapterToMetadata);
      const lazyMetadata = [...lazyAdapters.values()]
        .filter((registration) => !adapters.has(registration.id))
        .map((registration) => ({ id: registration.id, extensions: registration.extensions, fenceLang: registration.id }));
      return [...eagerMetadata, ...lazyMetadata];
    },
    inferFromFile(filePath: string): string | undefined {
      const ext = normalizeExtension(path.extname(filePath));
      if (!ext) return undefined;
      for (const adapter of adapters.values()) {
        if (adapter.extensions.some((candidate) => normalizeExtension(candidate) === ext)) {
          return adapter.id;
        }
      }
      for (const registration of lazyAdapters.values()) {
        if (registration.extensions.some((candidate) => normalizeExtension(candidate) === ext)) {
          return registration.id;
        }
      }
      return undefined;
    },
    supportedExtensions(): string[] {
      const extensions = new Set<string>();
      for (const adapter of adapters.values()) {
        for (const extension of adapter.extensions) {
          extensions.add(normalizeExtension(extension));
        }
      }
      for (const registration of lazyAdapters.values()) {
        for (const extension of registration.extensions) {
          extensions.add(normalizeExtension(extension));
        }
      }
      return [...extensions].filter((ext) => ext.length > 0);
    },
    supportedLanguages(): string[] {
      const ids = new Set<string>();
      for (const id of adapters.keys()) ids.add(id);
      for (const id of lazyAdapters.keys()) ids.add(id);
      return [...ids];
    },
  };

  return api;
}

export function buildDefaultRegistry(): LanguageRegistry {
  const registry = createLanguageRegistry();
  registry.register(createTsFamilyAdapter({ id: "ts", extensions: [".ts", ".mts", ".cts"], fenceLang: "ts" }));
  registry.register(createTsFamilyAdapter({ id: "js", extensions: [".js", ".mjs", ".cjs"], fenceLang: "js" }));
  registry.register(createPythonAdapter({ id: "py", extensions: [".py"], fenceLang: "python" }));
  registry.register(createGoAdapter({ id: "go", extensions: [".go"], fenceLang: "go" }));
  registry.register(createMarkdownAdapter({ id: "md", extensions: [".md", ".mdx"], fenceLang: "markdown" }));
  registry.register(createRustAdapter());
  registry.register(createElixirAdapter());
  registry.register(createLatexAdapter());
  registry.register(createJavaAdapter());
  registry.register(createKotlinAdapter());
  registry.register(createCSharpAdapter());
  registry.register(createCppAdapter());
  registry.register(createRubyAdapter());
  registry.register(createPhpAdapter());
  registry.register(createSwiftAdapter());
  registry.register(createDartAdapter());
  registry.register(createScalaAdapter());
  registry.register(createRAdapter());
  registry.register(createLuaAdapter());
  registry.register(createPerlAdapter());
  registry.register(createShellAdapter());
  registry.register(createSqlAdapter());
  registry.register(createCssAdapter());
  registry.register(createDataAdapter());
  registry.register(createHtmlAdapter());
  return registry;
}

// ============================================================================
// File Discovery (native fs, no globby)
// ============================================================================
const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
  ".turbo",
  ".pytest_cache",
]);

function normalizePathForMatch(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

function compareFilesLogical(left: string, right: string): number {
  const leftNormalized = normalizePathForMatch(path.isAbsolute(left) ? path.relative(process.cwd(), left) : left);
  const rightNormalized = normalizePathForMatch(path.isAbsolute(right) ? path.relative(process.cwd(), right) : right);
  const leftDepth = leftNormalized.split("/").length;
  const rightDepth = rightNormalized.split("/").length;
  if (leftDepth !== rightDepth) return leftDepth - rightDepth;
  return leftNormalized.localeCompare(rightNormalized);
}

export function getSupportedGlobs(registry: LanguageRegistry): string[] {
  const extensions = registry.supportedExtensions();
  const globs = new Set<string>();
  for (const extension of extensions) {
    const normalized = normalizeExtension(extension);
    if (!normalized) continue;
    globs.add(`**/*${normalized}`);
  }
  return [...globs].sort();
}

export function isTestFile(filePath: string): boolean {
  const normalized = normalizePathForMatch(filePath);
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "test" || segment === "tests" || segment === "__tests__")) {
    return true;
  }
  const fileName = path.basename(normalized);
  return /(?:\.|_|-)test\.[^/]+$/i.test(fileName) || /(?:\.|_|-)spec\.[^/]+$/i.test(fileName);
}

interface IgnoreRule {
  pattern: string;
  negate: boolean;
  directoryOnly: boolean;
  anchored: boolean;
  baseDir: string;
}

function shouldIgnoreDir(name: string, ignoreFolders: readonly string[]): boolean {
  if (IGNORE_DIRS.has(name)) return true;
  for (const ig of ignoreFolders) {
    const trimmed = ig.trim();
    if (!trimmed) continue;
    if (name === trimmed || name === path.basename(trimmed)) return true;
  }
  return false;
}

function globToRegExp(pattern: string): RegExp {
  let escaped = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const ch = pattern[index];
    if (ch === "*" && pattern[index + 1] === "*" && pattern[index + 2] === "/") {
      escaped += "(?:.*/)?";
      index += 2;
      continue;
    }
    if (ch === "*" && pattern[index + 1] === "*") {
      escaped += ".*";
      index += 1;
      continue;
    }
    if (ch === "*") {
      escaped += "[^/]*";
      continue;
    }
    if (ch === "?") {
      escaped += "[^/]";
      continue;
    }
    escaped += /[.+^${}()|[\]\\]/u.test(ch ?? "") ? `\\${ch}` : ch;
  }
  return new RegExp(`^${escaped}$`, "u");
}

async function readGitignoreRules(dir: string): Promise<IgnoreRule[]> {
  const filePath = path.join(dir, ".gitignore");
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [];
  }
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const negate = line.startsWith("!");
      let pattern = negate ? line.slice(1) : line;
      const directoryOnly = pattern.endsWith("/");
      pattern = pattern.replace(/^\//u, "").replace(/\/$/u, "");
      return { pattern, negate, directoryOnly, anchored: line.startsWith("/") || pattern.includes("/"), baseDir: dir };
    });
}

function matchesIgnoreRule(rule: IgnoreRule, fullPath: string, isDirectory: boolean): boolean {
  if (rule.directoryOnly && !isDirectory) return false;
  const rel = normalizePathForMatch(path.relative(rule.baseDir, fullPath));
  if (rel.startsWith("../") || rel === "..") return false;
  const candidates = rule.anchored ? [rel] : [path.basename(rel), rel];
  const matcher = globToRegExp(normalizePathForMatch(rule.pattern));
  return candidates.some((candidate) => matcher.test(candidate));
}

function isIgnoredByRules(fullPath: string, isDirectory: boolean, rules: readonly IgnoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (matchesIgnoreRule(rule, fullPath, isDirectory)) ignored = !rule.negate;
  }
  return ignored;
}

async function walkDir(
  dir: string,
  registry: LanguageRegistry,
  options: {
    includeTests: boolean;
    maxDepth?: number;
    ignoreFolders: readonly string[];
    includeHidden: boolean;
    maxFiles?: number;
    currentDepth: number;
    results: string[];
    ignoreRules: readonly IgnoreRule[];
  },
): Promise<void> {
  if (options.maxFiles !== undefined && options.results.length >= options.maxFiles) return;
  const localRules = await readGitignoreRules(dir);
  const ignoreRules = [...options.ignoreRules, ...localRules];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (options.maxFiles !== undefined && options.results.length >= options.maxFiles) break;
    if (!options.includeHidden && entry.name.startsWith(".") && entry.name !== ".gitignore") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(entry.name, options.ignoreFolders)) continue;
      if (isIgnoredByRules(full, true, ignoreRules)) continue;
      if (options.maxDepth !== undefined && options.currentDepth >= options.maxDepth) continue;
      await walkDir(full, registry, { ...options, currentDepth: options.currentDepth + 1, ignoreRules });
    } else if (entry.isFile()) {
      if (isIgnoredByRules(full, false, ignoreRules)) continue;
      if (!options.includeTests && isTestFile(full)) continue;
      if (registry.inferFromFile(full)) options.results.push(full);
    }
  }
}

export async function discoverFiles(options: DiscoverFilesOptions): Promise<string[]> {
  if ("file" in options && typeof options.file === "string") {
    const resolved = path.resolve(options.file);
    return options.registry.inferFromFile(resolved) ? [resolved] : [];
  }

  const cwd = ("folder" in options && typeof options.folder === "string") ? path.resolve(options.folder) : process.cwd();
  try {
    const s = await stat(cwd);
    if (!s.isDirectory()) return [];
  } catch {
    return [];
  }

  const results: string[] = [];
  await walkDir(cwd, options.registry, {
    includeTests: options.includeTests ?? false,
    maxDepth: options.maxDepth,
    ignoreFolders: options.ignoreFolders ?? [],
    includeHidden: options.includeHidden ?? false,
    maxFiles: options.maxFiles,
    currentDepth: 0,
    results,
    ignoreRules: [],
  });

  return results.sort(compareFilesLogical);
}

// ============================================================================
// Extraction Pipeline
// ============================================================================
function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function resolveExtractAdapter(options: ExtractFromSourceOptions): LanguageAdapter {
  if (options.adapter) return options.adapter;
  if (options.registry && options.lang) {
    const adapter = options.registry.get(options.lang);
    if (adapter) return adapter;
    throw new Error(`Language adapter not loaded for "${options.lang}"`);
  }
  throw new Error("extractFromSource requires either { adapter } or { registry, lang }");
}

export function extractFromSource(options: ExtractFromSourceOptions): AggregatedExtractResult {
  const { filePath, source, extractOrder } = options;
  const adapter = resolveExtractAdapter(options);
  const context = adapter.buildContext({ source, filePath });
  return runExtractors({ adapter, context, extractOrder, warnUnsupportedKinds: options.warnUnsupportedKinds ?? true });
}

export async function processFile(options: ProcessFileOptions): Promise<FileSection> {
  const { registry, filePath, explicitLang, extractOrder } = options;
  const source = await readFile(filePath, "utf8");
  const lang = explicitLang ?? registry.inferFromFile(filePath);
  if (!lang) {
    throw new Error(formatUnsupportedFileMessage(filePath, registry));
  }
  const adapter = await registry.getOrLoad(lang);
  if (!adapter) {
    throw new Error(`Language "${lang}" is not supported`);
  }
  const extracted = extractFromSource({ adapter, filePath, source, extractOrder, warnUnsupportedKinds: options.warnUnsupportedKinds ?? true });
  return { filePath, lang, entries: extracted.entries, warnings: extracted.warnings };
}

export async function runPipeline(options: RunPipelineOptions): Promise<PipelineResult> {
  const sections: FileSection[] = [];
  const errors: PipelineError[] = [];
  for (const filePath of options.files) {
    try {
      sections.push(
        await processFile({
          registry: options.registry,
          filePath,
          ...(options.explicitLang ? { explicitLang: options.explicitLang } : {}),
          extractOrder: options.extractOrder,
          warnUnsupportedKinds: options.warnUnsupportedKinds ?? true,
        }),
      );
    } catch (err) {
      errors.push(toPipelineError(err, filePath));
    }
  }
  const warnings = sections.flatMap((section) => section.warnings);
  const seenLangs = uniqueInOrder(sections.map((section) => section.lang));
  return {
    success: errors.length === 0,
    sections,
    diagnostics: { warnings, errors },
    meta: { seenLangs },
  };
}

// ============================================================================
// Extractor runner
// ============================================================================
export interface RunExtractorsOptions<TContext extends ParseContext = ParseContext> {
  adapter: LanguageAdapter<TContext>;
  context: TContext;
  extractOrder: ExtractKind[];
  warnUnsupportedKinds?: boolean;
}

const FALLBACK_COMBINED_POS = Number.MAX_SAFE_INTEGER;

function toLineNumber(source: string, position: number): number {
  let lineNumber = 1;
  for (let index = 0; index < position; index += 1) {
    if (source[index] === "\n") lineNumber += 1;
  }
  return lineNumber;
}

function withEntryMetadata(entry: ExtractEntry, context: ParseContext): ExtractEntry {
  const sourcePos = entry.metadata?.sourcePos;
  return {
    ...entry,
    metadata: {
      ...entry.metadata,
      filePath: entry.metadata?.filePath ?? context.filePath,
      ...(sourcePos === undefined
        ? {}
        : { sourceLine: entry.metadata?.sourceLine ?? toLineNumber(context.source, sourcePos) }),
    },
  };
}

function toCombinedEntries(entries: ExtractEntry[], context: ParseContext): CombinedExtractEntry[] {
  return entries.map((entry) => {
    const normalized = withEntryMetadata(entry, context);
    return {
      kind: normalized.kind,
      lines: normalized.lines,
      pos: normalized.metadata?.sourcePos ?? FALLBACK_COMBINED_POS,
      ...(normalized.metadata ? { metadata: normalized.metadata } : {}),
    };
  });
}

export function runExtractors<TContext extends ParseContext = ParseContext>(
  options: RunExtractorsOptions<TContext>,
): AggregatedExtractResult {
  const { adapter, context, extractOrder } = options;
  const combinedGroups: CombinedExtractEntry[][] = [];
  const warnings: ExtractWarning[] = [];
  const unsupportedKinds = extractOrder.filter((kind) => !adapter.extractors.has(kind));
  if (options.warnUnsupportedKinds ?? true) {
    for (const kind of unsupportedKinds) {
      warnings.push({ level: "warning", message: `Extract kind "${kind}" is not supported for language "${adapter.id}"`, filePath: context.filePath, kind });
    }
  }
  const supportedKinds = extractOrder.filter((kind) => adapter.extractors.has(kind));
  if (supportedKinds.length === 0) {
    return { entries: [], warnings };
  }
  for (const kind of supportedKinds) {
    const extractor = adapter.extractors.get(kind);
    if (!extractor) continue;
    const result = extractor.extract(context);
    const entries = result.entries.map((entry) => withEntryMetadata(entry, context));
    warnings.push(...result.warnings);
    combinedGroups.push(toCombinedEntries(entries, context));
  }
  const entries = stripCombinedPositions(mergeAndSortEntries(combinedGroups));
  return { entries, warnings };
}

// ============================================================================
// Entry merging
// ============================================================================
export function flattenExtractEntries(entryGroups: ExtractEntry[][]): ExtractEntry[] {
  return entryGroups.flatMap((entries) => entries);
}

export function mergeAndSortEntries(entryGroups: CombinedExtractEntry[][]): CombinedExtractEntry[] {
  return entryGroups
    .flatMap((entries, groupIndex) => entries.map((entry, entryIndex) => ({ entry, groupIndex, entryIndex })))
    .sort((left, right) => {
      if (left.entry.pos !== right.entry.pos) return left.entry.pos - right.entry.pos;
      if (left.groupIndex !== right.groupIndex) return left.groupIndex - right.groupIndex;
      return left.entryIndex - right.entryIndex;
    })
    .map(({ entry }) => entry);
}

export function stripCombinedPositions(entries: CombinedExtractEntry[]): ExtractEntry[] {
  return entries.map(({ kind, lines, metadata }) => ({ kind, lines, ...(metadata ? { metadata } : {}) }));
}

// ============================================================================
// Output formatting
// ============================================================================
export function toDisplayPath(filePath: string): string {
  const normalized = path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;
  return sanitizeForDisplay(normalized.split(path.sep).join("/"));
}

function formatEntryLines(entry: ExtractEntry, includeLineNumbers: boolean, redact = true): string {
  const lines = entry.lines.map((line) => sanitizeAndMaybeRedactForDisplay(line, redact));
  const content = lines.join("\n");
  if (!includeLineNumbers) return content;
  const sourceLine = entry.metadata?.sourceLine;
  if (sourceLine === undefined) return content;
  const prefix = `${String(sourceLine)} `;
  const continuationPrefix = " ".repeat(prefix.length);
  return lines.map((line, index) => `${index === 0 ? prefix : continuationPrefix}${line}`).join("\n");
}

export function formatPlainOutput(
  sections: FileSection[],
  options: { includeLineNumbers?: boolean; redact?: boolean } = {},
): string {
  const parts: string[] = [];
  for (const section of sections) {
    if (section.entries.length === 0) continue;
    parts.push(`// ${toDisplayPath(section.filePath)}`);
    for (const entry of section.entries) {
      parts.push(formatEntryLines(entry, options.includeLineNumbers === true, options.redact !== false));
    }
    parts.push("");
  }
  return parts.join("\n").trimEnd();
}

export function detectFenceLanguage(options: DetectFenceLanguageOptions): string | undefined {
  const { registry, explicitLang, seenLangs } = options;
  if (explicitLang) {
    return getRegistryMetadata(registry, explicitLang)?.fenceLang ?? explicitLang;
  }
  if (seenLangs.length === 1) {
    const lang = seenLangs[0];
    if (lang) return getRegistryMetadata(registry, lang)?.fenceLang ?? lang;
  }
  return undefined;
}

export function toMarkdownCodeBlock(content: string, fenceLanguage: string | undefined): string {
  const openFence = fenceLanguage ? `\`\`\`${fenceLanguage}` : "\`\`\`";
  const body = content.split(/\r?\n/u).map(sanitizeForMarkdown).join("\n");
  return `${openFence}\n${body.endsWith("\n") ? body : `${body}\n`}\`\`\``;
}

export function isMarkdownOutputPath(outputPath: string | undefined): boolean {
  if (!outputPath) return false;
  const extension = path.extname(outputPath).toLowerCase();
  return extension === ".md" || extension === ".mdx";
}

export function formatFinalOutput(options: FormatFinalOutputOptions): string {
  const { registry, sections, explicitLang, seenLangs } = options;
  const plainOutput = formatPlainOutput(sections, {
    ...(options.includeLineNumbers ? { includeLineNumbers: true } : {}),
    ...(options.redact === false ? { redact: false } : {}),
  });
  if (!plainOutput) return "";
  if (!isMarkdownOutputPath(options.outputPath)) return plainOutput;
  const fenceLang = detectFenceLanguage({
    registry,
    ...(explicitLang ? { explicitLang } : {}),
    seenLangs,
  });
  return toMarkdownCodeBlock(plainOutput, fenceLang);
}

// ============================================================================
// Helpers
// ============================================================================
export function ensureArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}
