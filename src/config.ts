import type { Config, DecisionConfig, FeedConfig, LlmConfig, Provider } from "./types.ts";

interface TomlTable {
  [key: string]: TomlValue;
}

type TomlValue = string | number | boolean | TomlValue[] | TomlTable;

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_OPENAI_URL = "https://api.mistral.ai/v1";
const DEFAULT_DECISION_URL = "http://127.0.0.1:8000";

export interface EditableConfig {
  llm: {
    provider: Provider;
    model: string;
    baseUrl: string;
    manageLocal: boolean;
    apiKeyEnv: string;
    timeoutSeconds: number;
    retries: number;
    temperature?: number;
  };
  decision: {
    enabled: boolean;
    baseUrl: string;
    confidenceThreshold: number;
    timeoutSeconds: number;
  };
  output: {
    directory: string;
    readingTimeMinutes: number;
  };
  domain: {
    focus: string;
  };
  feeds: Array<{
    url: string;
    name: string;
    type: "rss" | "youtube";
    maxItems?: number;
    keywords: string[];
    pattern: string;
  }>;
}

export async function loadConfig(path = "config.toml"): Promise<Config> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Config file not found: ${path}`);
    }
    throw error;
  }
  return normalizeConfig(parseToml(text));
}

export async function loadConfigForWeb(
  path = "config.toml",
): Promise<{ config: Config; issue?: string }> {
  try {
    return { config: await loadConfig(path) };
  } catch (error) {
    return { config: setupConfig(), issue: message(error) };
  }
}

export function setupConfig(): Config {
  return {
    llm: {
      provider: "ollama",
      model: "qwen2.5:3b",
      baseUrl: DEFAULT_OLLAMA_URL,
      manageLocal: true,
      timeoutMs: 900_000,
      retries: 2,
    },
    decision: {
      enabled: false,
      baseUrl: DEFAULT_DECISION_URL,
      confidenceThreshold: 0.9,
      timeoutMs: 10_000,
    },
    output: { directory: "~/distils", readingTimeMinutes: 5 },
    domain: { focus: "" },
    feeds: [],
  };
}

export function editableConfig(config: Config): EditableConfig {
  return {
    llm: {
      provider: config.llm.provider,
      model: config.llm.model,
      baseUrl: config.llm.baseUrl,
      manageLocal: config.llm.manageLocal,
      apiKeyEnv: config.llm.apiKeyEnv ?? "",
      timeoutSeconds: config.llm.timeoutMs / 1_000,
      retries: config.llm.retries,
      temperature: config.llm.temperature,
    },
    decision: {
      enabled: config.decision.enabled,
      baseUrl: config.decision.baseUrl,
      confidenceThreshold: config.decision.confidenceThreshold,
      timeoutSeconds: config.decision.timeoutMs / 1_000,
    },
    output: {
      directory: config.output.directory,
      readingTimeMinutes: config.output.readingTimeMinutes,
    },
    domain: { focus: config.domain.focus },
    feeds: config.feeds.map((feed) => ({
      url: feed.url,
      name: feed.name,
      type: feed.type,
      maxItems: feed.maxItems,
      keywords: feed.keywords ?? [],
      pattern: feed.pattern ?? "",
    })),
  };
}

export function normalizeEditableConfig(value: unknown): Config {
  const root = inputTable(value, "configuration");
  const llm = inputTable(root.llm, "llm");
  const decision = inputTable(root.decision, "decision");
  const output = inputTable(root.output, "output");
  const domain = inputTable(root.domain, "domain");
  if (!Array.isArray(root.feeds)) throw new Error("feeds must be a list");

  const raw: TomlTable = {
    llm: {
      provider: inputScalar(llm.provider, "llm.provider"),
      model: inputScalar(llm.model, "llm.model"),
      base_url: inputScalar(llm.baseUrl, "llm.baseUrl"),
      manage_local: inputScalar(llm.manageLocal, "llm.manageLocal"),
      api_key_env: inputScalar(llm.apiKeyEnv, "llm.apiKeyEnv"),
      timeout_seconds: inputScalar(llm.timeoutSeconds, "llm.timeoutSeconds"),
      retries: inputScalar(llm.retries, "llm.retries"),
      ...(llm.temperature === undefined
        ? {}
        : { temperature: inputScalar(llm.temperature, "llm.temperature") }),
    },
    decision: {
      enabled: inputScalar(decision.enabled, "decision.enabled"),
      base_url: inputScalar(decision.baseUrl, "decision.baseUrl"),
      confidence_threshold: inputScalar(
        decision.confidenceThreshold,
        "decision.confidenceThreshold",
      ),
      timeout_seconds: inputScalar(
        decision.timeoutSeconds,
        "decision.timeoutSeconds",
      ),
    },
    output: {
      directory: inputScalar(output.directory, "output.directory"),
      reading_time_minutes: inputScalar(
        output.readingTimeMinutes,
        "output.readingTimeMinutes",
      ),
    },
    domain: { focus: inputScalar(domain.focus, "domain.focus") },
    feeds: root.feeds.map((value, index) => {
      const feed = inputTable(value, `feeds[${index}]`);
      return {
        url: inputScalar(feed.url, `feeds[${index}].url`),
        name: inputScalar(feed.name, `feeds[${index}].name`),
        type: inputScalar(feed.type, `feeds[${index}].type`),
        ...(feed.maxItems === undefined
          ? {}
          : { max_items: inputScalar(feed.maxItems, `feeds[${index}].maxItems`) }),
        keywords: inputStringArray(feed.keywords, `feeds[${index}].keywords`),
        pattern: inputScalar(feed.pattern, `feeds[${index}].pattern`),
      };
    }),
  };
  const config = normalizeConfig(raw);
  if (!config.domain.focus) throw new Error("domain.focus must not be empty");
  return config;
}

export function formatConfig(config: Config): string {
  const lines = [
    "[llm]",
    `provider = ${tomlString(config.llm.provider)}`,
    `model = ${tomlString(config.llm.model)}`,
    `base_url = ${tomlString(config.llm.baseUrl)}`,
    `manage_local = ${config.llm.manageLocal}`,
    `timeout_seconds = ${numberText(config.llm.timeoutMs / 1_000)}`,
    `retries = ${config.llm.retries}`,
  ];
  if (config.llm.apiKeyEnv !== undefined) {
    lines.push(`api_key_env = ${tomlString(config.llm.apiKeyEnv)}`);
  }
  if (config.llm.temperature !== undefined) {
    lines.push(`temperature = ${numberText(config.llm.temperature)}`);
  }
  lines.push(
    "",
    "[decision]",
    `enabled = ${config.decision.enabled}`,
    `base_url = ${tomlString(config.decision.baseUrl)}`,
    `confidence_threshold = ${numberText(config.decision.confidenceThreshold)}`,
    `timeout_seconds = ${numberText(config.decision.timeoutMs / 1_000)}`,
    "",
    "[output]",
    `directory = ${tomlString(config.output.directory)}`,
    `reading_time_minutes = ${config.output.readingTimeMinutes}`,
    "",
    "[domain]",
    `focus = ${tomlString(config.domain.focus)}`,
  );
  for (const feed of config.feeds) {
    lines.push(
      "",
      "[[feeds]]",
      `url = ${tomlString(feed.url)}`,
      `name = ${tomlString(feed.name)}`,
      `type = ${tomlString(feed.type)}`,
    );
    if (feed.maxItems !== undefined) lines.push(`max_items = ${feed.maxItems}`);
    if (feed.keywords !== undefined && feed.keywords.length > 0) {
      lines.push(`keywords = [${feed.keywords.map(tomlString).join(", ")}]`);
    }
    if (feed.pattern !== undefined) lines.push(`pattern = ${tomlString(feed.pattern)}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function saveConfig(path: string, config: Config): Promise<void> {
  if (!path.trim()) throw new Error("Configuration path must not be empty");
  const content = formatConfig(config);
  normalizeConfig(parseToml(content));
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await Deno.writeTextFile(temporaryPath, content, { createNew: true, mode: 0o600 });
    await Deno.rename(temporaryPath, path);
  } finally {
    try {
      await Deno.remove(temporaryPath);
    } catch {
      // A failed write or rename remains the primary error; cleanup is best effort.
    }
  }
}

export function parseToml(source: string): TomlTable {
  const root: TomlTable = {};
  let current = root;

  for (const [index, originalLine] of source.split(/\r?\n/).entries()) {
    const line = stripComment(originalLine).trim();
    if (!line) continue;

    const arrayHeader = line.match(/^\[\[([A-Za-z0-9_.-]+)\]\]$/);
    if (arrayHeader) {
      const segments = arrayHeader[1].split(".");
      const key = segments.pop()!;
      const parent = ensureTable(root, segments, index + 1);
      const existing = parent[key];
      if (existing !== undefined && !Array.isArray(existing)) {
        throw tomlError(index + 1, `${arrayHeader[1]} is not an array`);
      }
      const table: TomlTable = {};
      const tables = (existing ?? []) as TomlValue[];
      tables.push(table);
      parent[key] = tables;
      current = table;
      continue;
    }

    const tableHeader = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (tableHeader) {
      current = ensureTable(root, tableHeader[1].split("."), index + 1);
      continue;
    }

    const equals = findUnquoted(line, "=");
    if (equals < 1) throw tomlError(index + 1, "expected key = value");
    const key = line.slice(0, equals).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
      throw tomlError(index + 1, `invalid key: ${key}`);
    }
    setDottedValue(
      current,
      key.split("."),
      parseValue(line.slice(equals + 1).trim(), index + 1),
      index + 1,
    );
  }

  return root;
}

export function normalizeConfig(raw: TomlTable): Config {
  const llmRaw = table(raw.llm);
  const rawModel = stringValue(llmRaw.model, "ollama/qwen2.5:3b");
  const explicitProvider = stringValue(llmRaw.provider, "");
  const explicitBaseUrl = stringValue(llmRaw.base_url, "");
  const provider = resolveProvider(explicitProvider, rawModel, explicitBaseUrl);
  const model = provider === "ollama" && rawModel.startsWith("ollama/")
    ? rawModel.slice("ollama/".length)
    : rawModel;
  if (!model) throw new Error("llm.model must not be empty");

  const baseUrl = trimTrailingSlash(
    explicitBaseUrl || (provider === "ollama" ? DEFAULT_OLLAMA_URL : DEFAULT_OPENAI_URL),
  );
  assertHttpUrl(baseUrl, "llm.base_url");

  const timeoutSeconds = positiveNumber(
    llmRaw.timeout_seconds,
    900,
    "llm.timeout_seconds",
  );
  const retries = nonNegativeInteger(llmRaw.retries, 2, "llm.retries");
  const apiKeyEnv = stringValue(llmRaw.api_key_env, inferApiKeyEnv(baseUrl));
  const temperature = optionalNumber(llmRaw.temperature, "llm.temperature");
  const manageLocal = booleanValue(
    llmRaw.manage_local,
    provider === "ollama" && isLoopbackHttpUrl(baseUrl),
    "llm.manage_local",
  );
  if (manageLocal && (provider !== "ollama" || !isLoopbackHttpUrl(baseUrl))) {
    throw new Error("llm.manage_local requires a loopback Ollama endpoint");
  }

  const outputRaw = table(raw.output);
  const decisionRaw = table(raw.decision);
  const domainRaw = table(raw.domain);
  const feedsRaw = Array.isArray(raw.feeds) ? raw.feeds : [];
  const feeds = feedsRaw.map((value, index) => normalizeFeed(value, index));
  if (feeds.length === 0) throw new Error("At least one [[feeds]] entry is required");

  const llm: LlmConfig = {
    provider,
    model,
    baseUrl,
    manageLocal,
    apiKeyEnv: apiKeyEnv || undefined,
    timeoutMs: timeoutSeconds * 1000,
    retries,
    temperature,
  };
  const decisionBaseUrl = trimTrailingSlash(
    stringValue(decisionRaw.base_url, DEFAULT_DECISION_URL),
  );
  assertLoopbackHttpUrl(decisionBaseUrl, "decision.base_url");
  const decision: DecisionConfig = {
    enabled: booleanValue(decisionRaw.enabled, false, "decision.enabled"),
    baseUrl: decisionBaseUrl,
    confidenceThreshold: boundedNumber(
      decisionRaw.confidence_threshold,
      0.9,
      0,
      1,
      "decision.confidence_threshold",
    ),
    timeoutMs: positiveNumber(
      decisionRaw.timeout_seconds,
      10,
      "decision.timeout_seconds",
    ) * 1_000,
  };

  return {
    llm,
    decision,
    output: {
      directory: stringValue(outputRaw.directory, "~/distils"),
      readingTimeMinutes: positiveInteger(
        outputRaw.reading_time_minutes,
        5,
        "output.reading_time_minutes",
      ),
    },
    domain: {
      focus: stringValue(domainRaw.focus, "technology"),
    },
    feeds,
  };
}

function normalizeFeed(value: TomlValue, index: number): FeedConfig {
  const raw = table(value);
  const label = `feeds[${index}]`;
  const url = stringValue(raw.url, "");
  if (!url) throw new Error(`${label}.url is required`);
  assertHttpUrl(url, `${label}.url`);

  const typeValue = stringValue(raw.type, isYoutubeUrl(url) ? "youtube" : "rss");
  if (typeValue !== "rss" && typeValue !== "youtube") {
    throw new Error(`${label}.type must be "rss" or "youtube"`);
  }

  const maxItems = raw.max_items === undefined
    ? undefined
    : positiveInteger(raw.max_items, 1, `${label}.max_items`);
  const keywords = optionalStringArray(raw.keywords, `${label}.keywords`);
  const pattern = raw.pattern === undefined ? undefined : stringValue(raw.pattern, "");
  if (pattern) {
    try {
      new RegExp(pattern.replace(/^\(\?i\)/, ""), "i");
    } catch {
      throw new Error(`${label}.pattern is not a valid regular expression`);
    }
  }

  return {
    url,
    name: stringValue(raw.name, new URL(url).hostname),
    type: typeValue,
    maxItems,
    keywords,
    pattern: pattern || undefined,
  };
}

function resolveProvider(raw: string, model: string, baseUrl: string): Provider {
  if (raw && raw !== "ollama" && raw !== "openai") {
    throw new Error('llm.provider must be "ollama" or "openai"');
  }
  if (raw === "ollama" || raw === "openai") return raw;
  return model.startsWith("ollama/") || baseUrl.includes(":11434") ? "ollama" : "openai";
}

function inferApiKeyEnv(baseUrl: string): string {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  if (hostname === "api.mistral.ai") return "MISTRAL_API_KEY";
  if (hostname.includes("9router")) return "NINEROUTER_KEY";
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return "";
  }
  return "OPENAI_API_KEY";
}

function isYoutubeUrl(value: string): boolean {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === "youtu.be" || hostname === "youtube.com" ||
    hostname.endsWith(".youtube.com");
}

function parseValue(value: string, line: number): TomlValue {
  if (!value) throw tomlError(line, "missing value");
  if (value.startsWith('"')) return parseBasicString(value, line);
  if (value.startsWith("'")) return parseLiteralString(value, line);
  if (value.startsWith("[")) return parseArray(value, line);
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^[+-]?\d+$/.test(value)) return Number.parseInt(value.replaceAll("_", ""), 10);
  if (/^[+-]?(?:\d+\.\d*|\d*\.\d+)$/.test(value)) {
    return Number.parseFloat(value.replaceAll("_", ""));
  }
  throw tomlError(line, `unsupported value: ${value}`);
}

function parseBasicString(value: string, line: number): string {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "string") throw new Error();
    return parsed;
  } catch {
    throw tomlError(line, "invalid quoted string");
  }
}

function parseLiteralString(value: string, line: number): string {
  if (value.length < 2 || !value.endsWith("'")) {
    throw tomlError(line, "invalid literal string");
  }
  return value.slice(1, -1);
}

function parseArray(value: string, line: number): TomlValue[] {
  if (!value.endsWith("]")) throw tomlError(line, "unterminated array");
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];
  return splitUnquoted(inner, ",").map((part) => parseValue(part.trim(), line));
}

function stripComment(line: string): string {
  const index = findUnquoted(line, "#");
  return index < 0 ? line : line.slice(0, index);
}

function findUnquoted(value: string, needle: string): number {
  let quote = "";
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "[") depth++;
    if (char === "]") depth--;
    if (char === needle && depth === 0) return index;
  }
  return -1;
}

function splitUnquoted(value: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "[") depth++;
    if (char === "]") depth--;
    if (char === separator && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function ensureTable(root: TomlTable, segments: string[], line: number): TomlTable {
  let current = root;
  for (const segment of segments) {
    const existing = current[segment];
    if (existing === undefined) {
      current[segment] = {};
    } else if (Array.isArray(existing) || typeof existing !== "object") {
      throw tomlError(line, `${segment} is not a table`);
    }
    current = current[segment] as TomlTable;
  }
  return current;
}

function setDottedValue(
  root: TomlTable,
  segments: string[],
  value: TomlValue,
  line: number,
): void {
  const key = segments.pop()!;
  const target = ensureTable(root, segments, line);
  if (target[key] !== undefined) throw tomlError(line, `duplicate key: ${key}`);
  target[key] = value;
}

function table(value: TomlValue | undefined): TomlTable {
  return value && !Array.isArray(value) && typeof value === "object" ? value : {};
}

function stringValue(value: TomlValue | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error("Expected a string configuration value");
  return value.trim();
}

function optionalStringArray(
  value: TomlValue | undefined,
  name: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be an array of strings`);
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function optionalNumber(value: TomlValue | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

function booleanValue(
  value: TomlValue | undefined,
  fallback: boolean,
  name: string,
): boolean {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "boolean") throw new Error(`${name} must be a boolean`);
  return result;
}

function boundedNumber(
  value: TomlValue | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== "number" || !Number.isFinite(result) || result < minimum ||
    result > maximum
  ) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return result;
}

function positiveNumber(
  value: TomlValue | undefined,
  fallback: number,
  name: string,
): number {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isFinite(result) || result <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return result;
}

function positiveInteger(
  value: TomlValue | undefined,
  fallback: number,
  name: string,
): number {
  const result = positiveNumber(value, fallback, name);
  if (!Number.isInteger(result)) throw new Error(`${name} must be an integer`);
  return result;
}

function nonNegativeInteger(
  value: TomlValue | undefined,
  fallback: number,
  name: string,
): number {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isInteger(result) || result < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return result;
}

function assertHttpUrl(value: string, name: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
}

function assertLoopbackHttpUrl(value: string, name: string): void {
  assertHttpUrl(value, name);
  if (!isLoopbackHttpUrl(value)) {
    throw new Error(`${name} must use a loopback host`);
  }
}

function isLoopbackHttpUrl(value: string): boolean {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function tomlError(line: number, message: string): Error {
  return new Error(`Invalid TOML at line ${line}: ${message}`);
}

function inputTable(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function inputScalar(value: unknown, name: string): TomlValue {
  if (
    typeof value !== "string" && typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    throw new Error(`${name} has an invalid value`);
  }
  return value;
}

function inputStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be a list of text values`);
  }
  return value as string[];
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function numberText(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Configuration numbers must be finite");
  return String(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
