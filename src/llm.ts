import type { ChatClient, ChatMessage, FetchLike, LlmConfig } from "./types.ts";

export interface LlmClientDependencies {
  fetcher?: FetchLike;
  apiKey?: string;
  getEnv?: (name: string) => string | undefined;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class OpenAICompatibleClient implements ChatClient {
  readonly #config: LlmConfig;
  readonly #fetcher: FetchLike;
  readonly #apiKey: string;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(config: LlmConfig, dependencies: LlmClientDependencies = {}) {
    this.#config = config;
    this.#fetcher = dependencies.fetcher ?? fetch;
    this.#sleep = dependencies.sleep ?? delay;
    const getEnv = dependencies.getEnv ?? ((name: string) => Deno.env.get(name));
    this.#apiKey = dependencies.apiKey ??
      (config.apiKeyEnv ? getEnv(config.apiKeyEnv) ?? "" : "");
    if (config.apiKeyEnv && !this.#apiKey) {
      throw new Error(
        `Missing API key: set ${config.apiKeyEnv} for ${config.baseUrl}`,
      );
    }
  }

  async complete(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const response = await this.#request(messages, false, signal);
    const payload = await parseJson(response);
    const content = completionContent(payload);
    if (!content) throw new Error("LLM returned an empty completion");
    return content;
  }

  async *stream(
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const response = await this.#request(messages, true, signal);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      const content = completionContent(await parseJson(response));
      if (content) yield content;
      return;
    }
    if (!response.body) throw new Error("LLM returned an empty response body");

    let buffer = "";
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      buffer = (buffer + chunk).replaceAll("\r\n", "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const content = parseSseEvent(event);
        if (content === null) return;
        if (content) yield content;
      }
    }
    if (buffer.trim()) {
      const content = parseSseEvent(buffer);
      if (content) yield content;
    }
  }

  async #request(
    messages: ChatMessage[],
    stream: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
    const endpoint = `${this.#config.baseUrl}/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.#config.model,
      messages,
      stream,
    };
    if (this.#config.temperature !== undefined) {
      body.temperature = this.#config.temperature;
    }
    const headers = new Headers({
      accept: stream ? "text/event-stream" : "application/json",
      "content-type": "application/json",
    });
    if (this.#apiKey) headers.set("authorization", `Bearer ${this.#apiKey}`);

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#config.retries; attempt++) {
      const timeoutSignal = AbortSignal.timeout(this.#config.timeoutMs);
      const requestSignal = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;
      try {
        const response = await this.#fetcher(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: requestSignal,
        });
        if (response.ok) return response;

        const details = (await response.text()).slice(0, 2_000).trim();
        const message = `LLM request failed with HTTP ${response.status}${
          details ? `: ${details}` : ""
        }`;
        if (!isRetryableStatus(response.status) || attempt === this.#config.retries) {
          throw new Error(message);
        }
        lastError = new Error(message);
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        await this.#sleep(retryAfter ?? backoff(attempt));
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (
          error instanceof Error &&
          error.message.startsWith("LLM request failed with HTTP")
        ) {
          throw error;
        }
        lastError = error;
        if (attempt === this.#config.retries) break;
        await this.#sleep(backoff(attempt));
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`LLM request failed after retries: ${message}`);
  }
}

function completionContent(payload: unknown): string {
  const record = asRecord(payload);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = asRecord(choices[0]);
  const message = asRecord(first.message);
  return contentText(message.content);
}

function parseSseEvent(event: string): string | null {
  const data = event.split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  if (!data) return "";
  if (data === "[DONE]") return null;
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new Error("LLM returned malformed streaming JSON");
  }
  const record = asRecord(payload);
  if (record.error) {
    const error = asRecord(record.error);
    throw new Error(`LLM streaming error: ${String(error.message ?? "unknown error")}`);
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  return contentText(asRecord(asRecord(choices[0]).delta).content);
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    const record = asRecord(part);
    return typeof record.text === "string"
      ? record.text
      : typeof record.content === "string"
      ? record.content
      : "";
  }).join("");
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("LLM returned malformed JSON");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function backoff(attempt: number): number {
  return Math.min(4_000, 250 * 2 ** attempt);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
