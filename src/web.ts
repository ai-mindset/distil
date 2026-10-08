import { collectContent } from "./content.ts";
import { streamDistil } from "./prompts.ts";
import { listDigests, readDigest, saveDigest } from "./storage.ts";
import type { ChatClient, CollectionResult, Config, ContentItem } from "./types.ts";
import { historyPage, homePage, notFoundPage, viewPage } from "./web_ui.ts";

export interface WebDependencies {
  config: Config;
  client: ChatClient;
  historyDirectory?: string;
  collect?: (days: number) => Promise<CollectionResult>;
  ensureProvider?: () => Promise<void>;
  now?: () => Date;
}

export class DistilWebApp {
  readonly #config: Config;
  readonly #client: ChatClient;
  readonly #historyDirectory: string;
  readonly #collect: (days: number) => Promise<CollectionResult>;
  readonly #ensureProvider: () => Promise<void>;
  readonly #now: () => Date;
  #cachedItems: ContentItem[] = [];
  #fetchInProgress = false;
  #generationInProgress = false;

  constructor(dependencies: WebDependencies) {
    this.#config = dependencies.config;
    this.#client = dependencies.client;
    this.#historyDirectory = dependencies.historyDirectory ?? "history";
    this.#collect = dependencies.collect ??
      ((days) => collectContent(this.#config.feeds, { daysBack: days }));
    this.#ensureProvider = dependencies.ensureProvider ?? (() => Promise.resolve());
    this.#now = dependencies.now ?? (() => new Date());
  }

  handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    try {
      if (
        request.method === "POST" &&
        request.headers.has("origin") &&
        request.headers.get("origin") !== url.origin
      ) {
        return json({ error: "Cross-origin requests are not allowed" }, 403);
      }
      if (request.method === "GET" && url.pathname === "/") {
        return html(homePage());
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, cachedItems: this.#cachedItems.length });
      }
      if (request.method === "POST" && url.pathname === "/api/fetch") {
        return await this.#handleFetch(request);
      }
      if (request.method === "POST" && url.pathname === "/api/generate") {
        return this.#handleGenerate(request);
      }
      if (request.method === "GET" && url.pathname === "/history") {
        return html(historyPage(await listDigests(this.#historyDirectory)));
      }
      if (request.method === "GET" && url.pathname.startsWith("/history/")) {
        return await this.#handleHistory(url.pathname.slice("/history/".length));
      }
      return html(notFoundPage(), 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, 500);
    }
  };

  async #handleFetch(request: Request): Promise<Response> {
    if (this.#fetchInProgress) return json({ error: "A fetch is already running" }, 409);
    let days: number;
    try {
      days = await requestDays(request);
    } catch {
      return json({ error: "Request body must contain valid JSON or form data" }, 400);
    }
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      return json({ error: "days must be an integer between 1 and 30" }, 400);
    }

    this.#fetchInProgress = true;
    try {
      const result = await this.#collect(days);
      this.#cachedItems = result.items;
      return json({
        itemCount: result.items.length,
        items: result.items.map((item) => ({
          title: item.title,
          link: item.link,
          source: item.source,
          date: item.date,
        })),
        health: result.health,
      });
    } finally {
      this.#fetchInProgress = false;
    }
  }

  #handleGenerate(request: Request): Response {
    if (this.#cachedItems.length === 0) {
      return json({ error: "No items fetched. Fetch content first." }, 409);
    }
    if (this.#generationInProgress) {
      return json({ error: "A generation is already running" }, 409);
    }

    const items = this.#cachedItems.slice();
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    const signal = AbortSignal.any([request.signal, abortController.signal]);
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#generationInProgress = true;
        void this.#generate(signal, items, controller, encoder);
      },
      cancel: () => {
        abortController.abort(new DOMException("Generation cancelled", "AbortError"));
        this.#generationInProgress = false;
      },
    });
    return new Response(stream, {
      headers: responseHeaders({
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
      }),
    });
  }

  async #generate(
    signal: AbortSignal,
    items: ContentItem[],
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
  ): Promise<void> {
    let content = "";
    const emit = (event: string, data: unknown) => {
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    };
    try {
      await this.#ensureProvider();
      for await (
        const chunk of streamDistil(this.#client, items, {
          domain: this.#config.domain.focus,
          readingTimeMinutes: this.#config.output.readingTimeMinutes,
          batchSize: 3,
          signal,
          onStage: (message) => emit("stage", { message }),
        })
      ) {
        content += chunk;
        emit("content", { content: chunk });
      }
      const path = await saveDigest(this.#historyDirectory, content, this.#now());
      emit("complete", { file: path.split(/[\\/]/).at(-1) });
    } catch (error) {
      if (!signal.aborted) {
        emit("error", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      this.#generationInProgress = false;
      try {
        controller.close();
      } catch {
        // The browser may have cancelled the stream.
      }
    }
  }

  async #handleHistory(rawFilename: string): Promise<Response> {
    let filename: string;
    try {
      filename = decodeURIComponent(rawFilename);
    } catch {
      return json({ error: "Invalid history path" }, 400);
    }
    try {
      const content = await readDigest(this.#historyDirectory, filename);
      return html(viewPage(filename, content));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return html(notFoundPage(), 404);
      if (error instanceof Error && error.message === "Invalid digest filename") {
        return json({ error: error.message }, 400);
      }
      throw error;
    }
  }
}

export function startServer(
  app: DistilWebApp,
  options: {
    hostname?: string;
    port?: number;
    onListen?: (address: Deno.NetAddr) => void;
  } = {},
): Deno.HttpServer {
  return Deno.serve({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 5001,
    onListen: options.onListen,
  }, app.handler);
}

async function requestDays(request: Request): Promise<number> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as { days?: unknown };
    return Number(body.days ?? 7);
  }
  if (contentType.includes("form")) {
    const body = await request.formData();
    return Number(body.get("days") ?? 7);
  }
  return 7;
}

function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: responseHeaders({
      "content-type": "text/html; charset=utf-8",
    }),
  });
}

function json(content: unknown, status = 200): Response {
  return Response.json(content, {
    status,
    headers: responseHeaders({
      "cache-control": "no-store",
    }),
  });
}

function responseHeaders(initial: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "style-src 'unsafe-inline'",
      "script-src 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  return headers;
}
