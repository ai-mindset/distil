import { collectContent } from "./content.ts";
import { streamDistil } from "./prompts.ts";
import {
  ContentSelector,
  resolveAllPending,
  resolvePendingSelection,
  type SelectionKind,
  type SelectionPipeline,
  type SelectionResult,
  unresolvedSelections,
} from "./selection.ts";
import { listDigests, readDigest, saveDigest } from "./storage.ts";
import type {
  ChatClient,
  CollectionResult,
  Config,
  ContentItem,
  ProgressUpdate,
} from "./types.ts";
import { historyPage, homePage, notFoundPage, viewPage } from "./web_ui.ts";

export interface WebDependencies {
  config: Config;
  client: ChatClient;
  historyDirectory?: string;
  collect?: (
    days: number,
    options: WebCollectionOptions,
  ) => Promise<CollectionResult>;
  selector?: SelectionPipeline;
  ensureProvider?: () => Promise<void>;
  now?: () => Date;
}

export interface WebCollectionOptions {
  signal: AbortSignal;
  onProgress: (update: ProgressUpdate) => void;
}

interface FetchPayload {
  itemCount: number;
  fetchedCount: number;
  selectedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  warning?: string;
  items: Array<{
    fingerprint: string;
    title: string;
    link: string;
    source: string;
    date: string;
    selected: boolean;
    kind: SelectionKind;
    reason: string;
    confidence?: number;
  }>;
  health: CollectionResult["health"];
}

interface FetchJob {
  id: number;
  status: "running" | "complete" | "error";
  startedAt: string;
  updatedAt: string;
  progress: ProgressUpdate;
  events: Array<ProgressUpdate & { at: string }>;
  controller: AbortController;
  collection?: CollectionResult;
  result?: FetchPayload;
  error?: string;
}

type SelectionResolution =
  | { selected: boolean; all: true }
  | { selected: boolean; all: false; fingerprint: string };

export class DistilWebApp {
  readonly #config: Config;
  readonly #client: ChatClient;
  readonly #historyDirectory: string;
  readonly #collect: (
    days: number,
    options: WebCollectionOptions,
  ) => Promise<CollectionResult>;
  readonly #selector: SelectionPipeline;
  readonly #ensureProvider: () => Promise<void>;
  readonly #now: () => Date;
  #cachedItems: ContentItem[] = [];
  #cachedSelection?: SelectionResult;
  #fetchJob?: FetchJob;
  #nextFetchJobId = 1;
  #generationInProgress = false;

  constructor(dependencies: WebDependencies) {
    this.#config = dependencies.config;
    this.#client = dependencies.client;
    this.#historyDirectory = dependencies.historyDirectory ?? "history";
    this.#collect = dependencies.collect ??
      ((days, options) =>
        collectContent(this.#config.feeds, {
          daysBack: days,
          signal: options.signal,
          onProgress: options.onProgress,
        }));
    this.#selector = dependencies.selector ??
      new ContentSelector(this.#config.decision, this.#config.domain.focus);
    this.#ensureProvider = dependencies.ensureProvider ?? (() => Promise.resolve());
    this.#now = dependencies.now ?? (() => new Date());
  }

  handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    try {
      if (
        (request.method === "POST" || request.method === "PATCH" ||
          request.method === "DELETE") &&
        request.headers.has("origin") &&
        request.headers.get("origin") !== url.origin
      ) {
        return json({ error: "Cross-origin requests are not allowed" }, 403);
      }
      if (request.method === "GET" && url.pathname === "/") {
        return html(homePage());
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          ok: true,
          cachedItems: this.#cachedItems.length,
          fetch: this.#fetchSnapshot(),
        });
      }
      if (request.method === "POST" && url.pathname === "/api/fetch") {
        return await this.#handleFetch(request);
      }
      if (request.method === "GET" && url.pathname === "/api/fetch/status") {
        return json(this.#fetchSnapshot());
      }
      if (request.method === "PATCH" && url.pathname === "/api/fetch/selection") {
        return await this.#handleSelectionResolution(request);
      }
      if (request.method === "DELETE" && url.pathname === "/api/fetch") {
        return this.#resetFetch();
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
    if (this.#fetchJob?.status === "running") {
      return json({
        ...this.#fetchSnapshot(),
        error: "A fetch is already running",
      }, 409);
    }
    let options: { days: number; includeSeen: boolean };
    try {
      options = await requestFetchOptions(request);
    } catch {
      return json({ error: "Request body must contain valid JSON or form data" }, 400);
    }
    if (!Number.isInteger(options.days) || options.days < 1 || options.days > 30) {
      return json({ error: "days must be an integer between 1 and 30" }, 400);
    }

    this.#cachedItems = [];
    this.#cachedSelection = undefined;
    const now = this.#now().toISOString();
    const job: FetchJob = {
      id: this.#nextFetchJobId++,
      status: "running",
      startedAt: now,
      updatedAt: now,
      progress: {
        stage: "collecting",
        completed: 0,
        total: this.#config.feeds.length,
        message: "Starting source collection",
      },
      events: [],
      controller: new AbortController(),
    };
    this.#fetchJob = job;
    this.#recordFetchProgress(job, job.progress);
    void this.#runFetch(job, options);
    return json(this.#fetchSnapshot(), 202);
  }

  async #runFetch(
    job: FetchJob,
    options: { days: number; includeSeen: boolean },
  ): Promise<void> {
    try {
      const result = await this.#collect(options.days, {
        signal: job.controller.signal,
        onProgress: (update) => this.#recordFetchProgress(job, update),
      });
      job.controller.signal.throwIfAborted();
      const selection = await this.#selector.select(result.items, {
        includeSeen: options.includeSeen,
        signal: job.controller.signal,
        onProgress: (update) => this.#recordFetchProgress(job, update),
      });
      job.controller.signal.throwIfAborted();
      if (this.#fetchJob !== job) return;
      job.collection = result;
      this.#cachedSelection = selection;
      this.#cachedItems = selection.selected;
      job.result = fetchPayload(result, selection);
      job.status = "complete";
      this.#recordFetchProgress(job, {
        stage: "selecting",
        completed: selection.items.length,
        total: selection.items.length,
        message:
          `Fetch complete: ${job.result.selectedCount} included, ${job.result.skippedCount} skipped, ${job.result.unresolvedCount} require review`,
      });
    } catch (error) {
      if (this.#fetchJob !== job) return;
      job.status = "error";
      job.error = job.controller.signal.aborted ? "Fetch cancelled" : message(error);
      this.#recordFetchProgress(job, {
        stage: job.progress.stage,
        completed: job.progress.completed,
        total: job.progress.total,
        message: job.error,
      });
    }
  }

  #recordFetchProgress(job: FetchJob, update: ProgressUpdate): void {
    if (this.#fetchJob !== job) return;
    job.progress = update;
    job.updatedAt = this.#now().toISOString();
    job.events.push({ ...update, at: job.updatedAt });
    if (job.events.length > 100) job.events.splice(0, job.events.length - 100);
  }

  #fetchSnapshot(): Record<string, unknown> {
    const job = this.#fetchJob;
    if (!job) return { status: "idle", events: [] };
    return {
      id: job.id,
      status: job.status,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      progress: job.progress,
      events: job.events,
      result: job.result,
      error: job.error,
    };
  }

  #resetFetch(): Response {
    const job = this.#fetchJob;
    this.#fetchJob = undefined;
    this.#cachedItems = [];
    this.#cachedSelection = undefined;
    if (job?.status === "running") {
      job.controller.abort(new DOMException("Fetch cancelled by user", "AbortError"));
    }
    return json(this.#fetchSnapshot());
  }

  async #handleSelectionResolution(request: Request): Promise<Response> {
    const job = this.#fetchJob;
    if (
      job?.status !== "complete" || !job.collection || !this.#cachedSelection
    ) {
      return json({ error: "No completed fetch is available for review" }, 409);
    }

    let resolution: SelectionResolution;
    try {
      resolution = await requestSelectionResolution(request);
    } catch (error) {
      return json({ error: message(error) }, 400);
    }

    try {
      const policy = resolution.selected ? "include" : "exclude";
      const selection = resolution.all
        ? resolveAllPending(this.#cachedSelection, policy)
        : resolvePendingSelection(
          this.#cachedSelection,
          resolution.fingerprint,
          policy,
        );
      this.#cachedSelection = selection;
      this.#cachedItems = selection.selected;
      job.result = fetchPayload(job.collection, selection);
      this.#recordFetchProgress(job, {
        stage: "selecting",
        completed: selection.items.length,
        total: selection.items.length,
        message:
          `Review updated: ${job.result.selectedCount} included, ${job.result.skippedCount} skipped, ${job.result.unresolvedCount} require review`,
      });
      return json(this.#fetchSnapshot());
    } catch (error) {
      return json({ error: message(error) }, 409);
    }
  }

  #handleGenerate(request: Request): Response {
    const selection = this.#cachedSelection;
    if (this.#fetchJob?.status !== "complete" || !selection) {
      return json(
        { error: "No completed fetch is available. Fetch content first." },
        409,
      );
    }
    const unresolved = unresolvedSelections(selection).length;
    if (unresolved > 0) {
      return json({
        error: `Resolve ${unresolved} item(s) requiring review before generation.`,
      }, 409);
    }
    if (this.#cachedItems.length === 0) {
      return json({
        error: "No items are included. Include at least one item before generation.",
      }, 409);
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
        void this.#generate(signal, items, selection, controller, encoder);
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
    selection: SelectionResult,
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
          signal,
          onStage: (message) => emit("stage", { message }),
        })
      ) {
        content += chunk;
        emit("content", { content: chunk });
      }
      const path = await saveDigest(this.#historyDirectory, content, this.#now());
      try {
        await this.#selector.markReviewed(selection, this.#now());
      } catch (error) {
        emit("warning", {
          message: `Digest saved, but seen-item state was not updated: ${message(error)}`,
        });
      }
      this.#cachedItems = [];
      this.#cachedSelection = undefined;
      this.#fetchJob = undefined;
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

async function requestFetchOptions(
  request: Request,
): Promise<{ days: number; includeSeen: boolean }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as { days?: unknown; includeSeen?: unknown };
    if (body.includeSeen !== undefined && typeof body.includeSeen !== "boolean") {
      throw new Error("includeSeen must be a boolean");
    }
    return { days: Number(body.days ?? 7), includeSeen: body.includeSeen ?? false };
  }
  if (contentType.includes("form")) {
    const body = await request.formData();
    return {
      days: Number(body.get("days") ?? 7),
      includeSeen: body.get("includeSeen") === "true" || body.get("includeSeen") === "on",
    };
  }
  return { days: 7, includeSeen: false };
}

async function requestSelectionResolution(
  request: Request,
): Promise<SelectionResolution> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new Error("Request body must contain valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must contain a JSON object");
  }
  const body = value as { selected?: unknown; all?: unknown; fingerprint?: unknown };
  if (typeof body.selected !== "boolean") {
    throw new Error("selected must be a boolean");
  }
  if (body.all !== undefined && typeof body.all !== "boolean") {
    throw new Error("all must be a boolean");
  }
  if (body.all === true) return { selected: body.selected, all: true };
  const fingerprint = body.fingerprint;
  if (
    typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint)
  ) {
    throw new Error("fingerprint must be a lowercase SHA-256 value");
  }
  return { selected: body.selected, all: false, fingerprint };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fetchPayload(
  result: CollectionResult,
  selection: SelectionResult,
): FetchPayload {
  return {
    itemCount: selection.selected.length,
    fetchedCount: result.items.length,
    selectedCount: selection.selected.length,
    skippedCount:
      selection.items.filter((entry) =>
        !entry.selected && entry.kind !== "review" && entry.kind !== "fallback"
      ).length,
    unresolvedCount: unresolvedSelections(selection).length,
    warning: selection.warning,
    items: selection.items.map((entry) => ({
      fingerprint: entry.fingerprint,
      title: entry.item.title,
      link: entry.item.link,
      source: entry.item.source,
      date: entry.item.date,
      selected: entry.selected,
      kind: entry.kind,
      reason: entry.reason,
      confidence: entry.confidence,
    })),
    health: result.health,
  };
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
