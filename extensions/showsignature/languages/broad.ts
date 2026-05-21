import type { ExtractKind, LanguageAdapter } from "../core-types";
import { createLineAdapter, type LinePattern } from "./line-adapter";

const k = (kind: string) => kind as ExtractKind;
const pat = (kind: string, pattern: RegExp, collect: "line" | "balanced" | "keyword" = "line"): LinePattern => ({ kind: k(kind), pattern, collect });

export function createJavaAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "java", extensions: [".java"], fenceLang: "java", displayName: "Java", parserQuality: "line-scan", lineComment: "//", blockComment: { start: "/*", end: "*/" }, patterns: [
    pat("imports", /^(?:import|package)\b/u, "line"), pat("interfaces", /^(?:public\s+|protected\s+|private\s+|abstract\s+)*interface\s+\w+/u), pat("types", /^(?:public\s+|protected\s+|private\s+|abstract\s+|final\s+)*(?:class|enum|record|interface)\s+\w+/u), pat("signatures", /^(?:@[\w.]+\s*)*(?:public\s+|protected\s+|private\s+|static\s+|final\s+|abstract\s+|synchronized\s+|native\s+)*[\w<>\[\], ?]+\s+\w+\s*\([^;{]*\)/u), pat("variables", /^(?:public\s+|protected\s+|private\s+|static\s+|final\s+)*[\w<>\[\], ?]+\s+\w+\s*=/u, "line") ] });
}

export function createKotlinAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "kotlin", extensions: [".kt", ".kts"], fenceLang: "kotlin", displayName: "Kotlin", parserQuality: "line-scan", lineComment: "//", blockComment: { start: "/*", end: "*/" }, patterns: [
    pat("imports", /^(?:import|package)\b/u, "line"), pat("interfaces", /^(?:public\s+|private\s+|internal\s+|sealed\s+)*interface\s+\w+/u), pat("types", /^(?:data\s+|sealed\s+|open\s+|public\s+|private\s+|internal\s+)*(?:class|interface|object|enum\s+class|typealias)\s+\w+/u), pat("signatures", /^(?:suspend\s+|inline\s+|private\s+|public\s+|internal\s+)*fun\s+(?:[\w.<>]+\.)?\w+\s*\(/u), pat("variables", /^(?:private\s+|public\s+|internal\s+|const\s+)*(?:val|var)\s+\w+/u, "line") ] });
}

export function createCSharpAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "csharp", extensions: [".cs"], fenceLang: "csharp", displayName: "C#", parserQuality: "line-scan", lineComment: "//", blockComment: { start: "/*", end: "*/" }, patterns: [
    pat("imports", /^(?:using|namespace)\b/u, "line"), pat("interfaces", /^(?:public\s+|private\s+|internal\s+|protected\s+)*interface\s+I?\w+/u), pat("types", /^(?:public\s+|private\s+|internal\s+|protected\s+|sealed\s+|abstract\s+|partial\s+)*(?:class|struct|record|enum|interface)\s+\w+/u), pat("signatures", /^(?:public\s+|private\s+|internal\s+|protected\s+|static\s+|async\s+|virtual\s+|override\s+|abstract\s+)*[\w<>\[\], ?]+\s+\w+\s*\([^;{]*\)/u), pat("variables", /^(?:public\s+|private\s+|internal\s+|protected\s+|static\s+|const\s+|readonly\s+)*[\w<>\[\], ?]+\s+\w+\s*=/u, "line") ] });
}

export function createCppAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "cpp", extensions: [".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"], fenceLang: "cpp", displayName: "C / C++", parserQuality: "line-scan", lineComment: "//", blockComment: { start: "/*", end: "*/" }, patterns: [
    pat("imports", /^#\s*(?:include|import|define)\b/u, "line"), pat("types", /^(?:template\s*<[^>]+>\s*)?(?:class|struct|enum|union|typedef|using)\b/u), pat("signatures", /^(?:template\s*<[^>]+>\s*)?(?:inline\s+|static\s+|extern\s+|virtual\s+|constexpr\s+)*[\w:<>*&\s]+\s+[~\w:]+\s*\([^;]*\)/u), pat("variables", /^(?:extern\s+|static\s+|const\s+|constexpr\s+)*[\w:<>*&\s]+\s+\w+\s*=/u, "line") ] });
}

export function createRubyAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "ruby", extensions: [".rb"], fenceLang: "ruby", displayName: "Ruby", parserQuality: "line-scan", lineComment: "#", keywordEnd: "end", patterns: [
    pat("imports", /^(?:require|require_relative|load|include|extend)\b/u, "line"), pat("types", /^(?:class|module)\s+[A-Z]\w*(?:::\w+)*/u, "keyword"), pat("signatures", /^def\s+(?:self\.)?[A-Za-z_][A-Za-z0-9_!?=]*/u, "keyword"), pat("variables", /^[A-Z][A-Z0-9_]*\s*=/u, "line") ] });
}

export function createPhpAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "php", extensions: [".php", ".phtml"], fenceLang: "php", displayName: "PHP", parserQuality: "line-scan", lineComment: "//", blockComment: { start: "/*", end: "*/" }, patterns: [
    pat("imports", /^(?:namespace|use|require|require_once|include|include_once)\b/u, "line"), pat("interfaces", /^(?:abstract\s+|final\s+)?interface\s+\w+/u), pat("types", /^(?:abstract\s+|final\s+)?(?:class|interface|trait|enum)\s+\w+/u), pat("signatures", /^(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+)*function\s+\w+\s*\(/u), pat("variables", /^(?:const\s+\w+|\$\w+)\s*=/u, "line") ] });
}

export function createShellAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "shell", extensions: [".sh", ".bash", ".zsh", ".fish"], fenceLang: "bash", displayName: "Shell", parserQuality: "line-scan", lineComment: "#", keywordEnd: "fi", patterns: [
    pat("imports", /^(?:source|\.)\s+\S+/u, "line"), pat("signatures", /^(?:function\s+)?[A-Za-z_][A-Za-z0-9_:-]*\s*\(\)\s*\{/u), pat("variables", /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=/u, "line") ] });
}

export function createSqlAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "sql", extensions: [".sql"], fenceLang: "sql", displayName: "SQL", parserQuality: "line-scan", lineComment: "--", blockComment: { start: "/*", end: "*/" }, patterns: [
    pat("sql:schema", /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|INDEX|FUNCTION|PROCEDURE|TRIGGER)\b/i), pat("types", /^CREATE\s+(?:TYPE|DOMAIN)\b/i), pat("signatures", /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b/i), pat("variables", /^WITH\s+\w+\s+AS\b/i, "line") ] });
}

export function createCssAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "css", extensions: [".css", ".scss", ".sass", ".less"], fenceLang: "css", displayName: "CSS / Sass / Less", parserQuality: "line-scan", lineComment: "//", blockComment: { start: "/*", end: "*/" }, patterns: [
    pat("css:rules", /^(?:@(?:media|supports|keyframes|font-face|layer|container)\b|[^{};]+[{])/u), pat("variables", /^--[A-Za-z0-9_-]+\s*:/u, "line") ] });
}

export function createDataAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "data", extensions: [".json", ".jsonc", ".yaml", ".yml", ".toml", ".ipynb"], fenceLang: "text", displayName: "JSON / YAML / TOML / Notebook", parserQuality: "data", lineComment: "#", patterns: [
    pat("data:keys", /^(?:["']?[A-Za-z0-9_.-]+["']?\s*[:=]|\[[A-Za-z0-9_.-]+\])/, "line"), pat("comments", /^#/u, "line") ] });
}

export function createHtmlAdapter(): LanguageAdapter {
  return createLineAdapter({ id: "html", extensions: [".html", ".htm", ".xml", ".xsd", ".svg", ".vue", ".svelte"], fenceLang: "html", displayName: "HTML / XML / SVG / Vue / Svelte", parserQuality: "line-scan", blockComment: { start: "<!--", end: "-->" }, patterns: [
    pat("html:landmarks", /^<\/?(?:html|head|body|main|section|article|nav|form|script|style|template|svg|[A-Z][A-Za-z0-9.-]*)\b/u, "line"), pat("imports", /^<script\b[^>]+src=/u, "line") ] });
}

export function createSwiftAdapter(): LanguageAdapter { return createLineAdapter({ id: "swift", extensions: [".swift"], fenceLang: "swift", displayName: "Swift", parserQuality: "line-scan", lineComment: "//", blockComment: { start: "/*", end: "*/" }, patterns: [pat("imports", /^import\b/u, "line"), pat("interfaces", /^protocol\s+\w+/u), pat("types", /^(?:class|struct|enum|actor|protocol|typealias)\s+\w+/u), pat("signatures", /^(?:public\s+|private\s+|internal\s+|static\s+|mutating\s+)*func\s+\w+/u), pat("variables", /^(?:let|var)\s+\w+/u, "line")] }); }
export function createDartAdapter(): LanguageAdapter { return createLineAdapter({ id: "dart", extensions: [".dart"], fenceLang: "dart", displayName: "Dart", parserQuality: "line-scan", lineComment: "//", blockComment: { start: "/*", end: "*/" }, patterns: [pat("imports", /^(?:import|export|part)\b/u, "line"), pat("types", /^(?:class|mixin|enum|extension|typedef)\s+\w+/u), pat("signatures", /^(?:Future<[^>]+>|[\w<>?]+)\s+\w+\s*\(/u), pat("variables", /^(?:final|const|var)\s+\w+/u, "line")] }); }
export function createScalaAdapter(): LanguageAdapter { return createLineAdapter({ id: "scala", extensions: [".scala", ".sc"], fenceLang: "scala", displayName: "Scala", parserQuality: "line-scan", lineComment: "//", blockComment: { start: "/*", end: "*/" }, patterns: [pat("imports", /^(?:import|package)\b/u, "line"), pat("interfaces", /^trait\s+\w+/u), pat("types", /^(?:class|case\s+class|trait|object|enum|type)\s+\w+/u), pat("signatures", /^def\s+\w+/u), pat("variables", /^(?:val|var)\s+\w+/u, "line")] }); }
export function createRAdapter(): LanguageAdapter { return createLineAdapter({ id: "r", extensions: [".r", ".R"], fenceLang: "r", displayName: "R", parserQuality: "line-scan", lineComment: "#", patterns: [pat("imports", /^(?:library|require|source)\s*\(/u, "line"), pat("signatures", /^[A-Za-z.][A-Za-z0-9_.]*\s*(?:<-|=)\s*function\s*\(/u), pat("variables", /^[A-Za-z.][A-Za-z0-9_.]*\s*(?:<-|=)/u, "line")] }); }
export function createLuaAdapter(): LanguageAdapter { return createLineAdapter({ id: "lua", extensions: [".lua"], fenceLang: "lua", displayName: "Lua", parserQuality: "line-scan", lineComment: "--", patterns: [pat("imports", /^local\s+\w+\s*=\s*require\b/u, "line"), pat("signatures", /^(?:local\s+)?function\s+[A-Za-z_.:][A-Za-z0-9_.:]*/u), pat("variables", /^local\s+\w+\s*=/u, "line")] }); }
export function createPerlAdapter(): LanguageAdapter { return createLineAdapter({ id: "perl", extensions: [".pl", ".pm"], fenceLang: "perl", displayName: "Perl", parserQuality: "line-scan", lineComment: "#", patterns: [pat("imports", /^(?:use|require|package)\b/u, "line"), pat("signatures", /^sub\s+\w+/u), pat("variables", /^(?:my|our|local)\s+[$@%]\w+/u, "line")] }); }
