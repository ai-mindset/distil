export type Provider = "ollama" | "openai";

export interface LlmConfig {
  provider: Provider;
  model: string;
  baseUrl: string;
  manageLocal: boolean;
  apiKeyEnv?: string;
  timeoutMs: number;
  retries: number;
  temperature?: number;
}

export interface OutputConfig {
  directory: string;
  readingTimeMinutes: number;
}

export interface DecisionConfig {
  enabled: boolean;
  baseUrl: string;
  confidenceThreshold: number;
  timeoutMs: number;
}

export interface FeedConfig {
  url: string;
  name: string;
  type: "rss" | "youtube";
  maxItems?: number;
  keywords?: string[];
  pattern?: string;
}

export interface Config {
  llm: LlmConfig;
  decision: DecisionConfig;
  output: OutputConfig;
  domain: {
    focus: string;
  };
  feeds: FeedConfig[];
}

export interface ContentItem {
  type: "article" | "video";
  source: string;
  sourceUrl: string;
  title: string;
  content: string;
  link: string;
  date: string;
}

export type FeedStatus = "success" | "warning" | "empty" | "timeout" | "error";

export interface FeedHealth {
  url: string;
  status: FeedStatus;
  message: string;
  totalEntries: number;
  filteredEntries: number;
  fetchTimeMs: number;
  keywords?: string[];
  maxItems?: number;
}

export interface CollectionResult {
  items: ContentItem[];
  health: Record<string, FeedHealth>;
}

export interface ProgressUpdate {
  stage: "collecting" | "selecting";
  completed: number;
  total: number;
  message: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatClient {
  complete(messages: ChatMessage[], signal?: AbortSignal): Promise<string>;
  stream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string>;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
