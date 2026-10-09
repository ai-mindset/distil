import type { ChatClient, ChatMessage, Config, ContentItem } from "../src/types.ts";
import { DistilWebApp } from "../src/web.ts";
import type { SelectionPipeline, SelectionResult } from "../src/selection.ts";
import { assertEquals, assertMatch } from "./assert.ts";

class WebClient implements ChatClient {
  complete(): Promise<string> {
    return Promise.resolve("summary");
  }

  async *stream(_messages: ChatMessage[]): AsyncIterable<string> {
    yield "# Digest\n";
    yield "- Finding";
  }
}

class WebSelector implements SelectionPipeline {
  marked = 0;

  select(items: ContentItem[]): Promise<SelectionResult> {
    return Promise.resolve({
      items: items.map((item, index) => ({
        item,
        fingerprint: `fingerprint-${index}`,
        selected: true,
        kind: "selected",
        reason: "Selected for test",
      })),
      selected: items,
    });
  }

  markReviewed(result: SelectionResult): Promise<void> {
    this.marked += result.items.length;
    return Promise.resolve();
  }
}

class ReviewSelector implements SelectionPipeline {
  marked = 0;

  select(items: ContentItem[]): Promise<SelectionResult> {
    return Promise.resolve({
      items: items.map((item, index) => ({
        item,
        fingerprint: (index === 0 ? "a" : "b").repeat(64),
        selected: false,
        kind: index === 0 ? "review" : "fallback",
        reason: index === 0
          ? "Strands classification confidence was below the threshold"
          : "Strands was unavailable",
        confidence: index === 0 ? 0.12 : undefined,
      })),
      selected: [],
      warning: "One or more items require review",
    });
  }

  markReviewed(result: SelectionResult): Promise<void> {
    this.marked += result.items.length;
    return Promise.resolve();
  }
}

Deno.test("web fetch and generation share the same pipeline", async () => {
  const historyDirectory = await Deno.makeTempDir();
  try {
    const selector = new WebSelector();
    const app = new DistilWebApp({
      config: testConfig(),
      client: new WebClient(),
      historyDirectory,
      selector,
      now: () => new Date("2026-10-08T12:00:00Z"),
      collect: () =>
        Promise.resolve({
          items: [testItem()],
          health: {
            Source: {
              url: "https://example.com/rss",
              status: "success",
              message: "",
              totalEntries: 1,
              filteredEntries: 1,
              fetchTimeMs: 1,
            },
          },
        }),
    });

    const beforeFetch = await app.handler(
      new Request("http://localhost/api/generate", { method: "POST" }),
    );
    assertEquals(beforeFetch.status, 409);

    const fetched = await app.handler(
      new Request("http://localhost/api/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      }),
    );
    assertEquals(fetched.status, 202);
    const fetchState = await completedFetch(app);
    const fetchPayload = fetchState.result;
    assertEquals(fetchPayload.itemCount, 1);
    assertEquals(fetchPayload.fetchedCount, 1);
    assertEquals(fetchPayload.items[0].reason, "Selected for test");

    const generated = await app.handler(
      new Request("http://localhost/api/generate", { method: "POST" }),
    );
    assertEquals(generated.status, 200);
    const events = await generated.text();
    assertMatch(events, /event: content/);
    assertMatch(events, /event: complete/);
    const filename = events.match(/"file":"([^"]+)"/)?.[1];
    if (!filename) throw new Error("completion event did not include a filename");
    assertEquals(selector.marked, 1);

    const history = await app.handler(new Request("http://localhost/history"));
    const historyHtml = await history.text();
    assertMatch(historyHtml, /distil-2026-10-08_120000Z\.md/);

    const saved = await app.handler(
      new Request(`http://localhost/history/${encodeURIComponent(filename)}`),
    );
    assertEquals(saved.status, 200);
    assertMatch(await saved.text(), /# Digest/);
  } finally {
    await Deno.remove(historyDirectory, { recursive: true });
  }
});

Deno.test("web fetch survives navigation and can be interrupted and reset", async () => {
  let signal: AbortSignal | undefined;
  const app = new DistilWebApp({
    config: testConfig(),
    client: new WebClient(),
    selector: new WebSelector(),
    collect: (_days, options) => {
      signal = options.signal;
      options.onProgress({
        stage: "collecting",
        completed: 0,
        total: 1,
        message: "Fetching slow source",
      });
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), {
          once: true,
        });
      });
    },
  });

  const started = await app.handler(
    new Request("http://localhost/api/fetch", { method: "POST" }),
  );
  assertEquals(started.status, 202);

  const duplicate = await app.handler(
    new Request("http://localhost/api/fetch", { method: "POST" }),
  );
  assertEquals(duplicate.status, 409);
  assertEquals((await duplicate.json()).status, "running");

  assertEquals((await app.handler(new Request("http://localhost/history"))).status, 200);
  assertEquals((await app.handler(new Request("http://localhost/"))).status, 200);
  const resumed = await app.handler(new Request("http://localhost/api/fetch/status"));
  const resumedState = await resumed.json();
  assertEquals(resumedState.status, "running");
  assertMatch(resumedState.progress.message, /slow source/);

  const reset = await app.handler(
    new Request("http://localhost/api/fetch", { method: "DELETE" }),
  );
  assertEquals(reset.status, 200);
  assertEquals((await reset.json()).status, "idle");
  assertEquals(signal?.aborted, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertEquals(
    (await (await app.handler(new Request("http://localhost/api/fetch/status"))).json())
      .status,
    "idle",
  );
});

Deno.test("web requires explicit resolution of uncertain selections", async () => {
  const historyDirectory = await Deno.makeTempDir();
  try {
    const selector = new ReviewSelector();
    const app = new DistilWebApp({
      config: testConfig(),
      client: new WebClient(),
      historyDirectory,
      selector,
      collect: () =>
        Promise.resolve({
          items: [testItem(), { ...testItem(), title: "Second finding" }],
          health: {
            Source: {
              url: "https://example.com/rss",
              status: "success",
              message: "",
              totalEntries: 2,
              filteredEntries: 2,
              fetchTimeMs: 1,
            },
          },
        }),
    });

    await app.handler(new Request("http://localhost/api/fetch", { method: "POST" }));
    const pending = await completedFetch(app);
    assertEquals(pending.result.itemCount, 0);
    assertEquals(pending.result.selectedCount, 0);
    assertEquals(pending.result.skippedCount, 0);
    assertEquals(pending.result.unresolvedCount, 2);

    const invalid = await resolveSelection(app, {
      fingerprint: "not-a-fingerprint",
      selected: true,
    });
    assertEquals(invalid.status, 400);
    assertMatch((await invalid.json()).error, /lowercase SHA-256/);

    const blocked = await app.handler(
      new Request("http://localhost/api/generate", { method: "POST" }),
    );
    assertEquals(blocked.status, 409);
    assertMatch((await blocked.json()).error, /Resolve 2 item/);

    const included = await resolveSelection(app, {
      fingerprint: "a".repeat(64),
      selected: true,
    });
    assertEquals(included.status, 200);
    const includedState = await included.json();
    assertEquals(includedState.result.itemCount, 1);
    assertEquals(includedState.result.unresolvedCount, 1);
    assertEquals(includedState.result.items[0].kind, "manual");
    assertMatch(includedState.result.items[0].reason, /^Included by user review\./);

    const duplicate = await resolveSelection(app, {
      fingerprint: "a".repeat(64),
      selected: false,
    });
    assertEquals(duplicate.status, 409);

    const excluded = await resolveSelection(app, { all: true, selected: false });
    assertEquals(excluded.status, 200);
    const resolved = await excluded.json();
    assertEquals(resolved.result.itemCount, 1);
    assertEquals(resolved.result.selectedCount, 1);
    assertEquals(resolved.result.skippedCount, 1);
    assertEquals(resolved.result.unresolvedCount, 0);
    assertMatch(resolved.progress.message, /0 require review/);
    assertEquals(resolved.result.items.map((item: { kind: string }) => item.kind), [
      "manual",
      "manual",
    ]);

    const generated = await app.handler(
      new Request("http://localhost/api/generate", { method: "POST" }),
    );
    assertEquals(generated.status, 200);
    assertMatch(await generated.text(), /event: complete/);
    assertEquals(selector.marked, 2);
  } finally {
    await Deno.remove(historyDirectory, { recursive: true });
  }
});

Deno.test("web validates days and confines history paths", async () => {
  const app = new DistilWebApp({
    config: testConfig(),
    client: new WebClient(),
    collect: () => Promise.reject(new Error("should not run")),
  });
  const badDays = await app.handler(
    new Request("http://localhost/api/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days: 31 }),
    }),
  );
  assertEquals(badDays.status, 400);

  const traversal = await app.handler(
    new Request("http://localhost/history/%2E%2E%2Fconfig.toml"),
  );
  assertEquals(traversal.status, 400);

  const malformed = await app.handler(
    new Request("http://localhost/api/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );
  assertEquals(malformed.status, 400);

  const crossOrigin = await app.handler(
    new Request("http://localhost/api/fetch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: JSON.stringify({ days: 7 }),
    }),
  );
  assertEquals(crossOrigin.status, 403);

  const crossOriginReview = await app.handler(
    new Request("http://localhost/api/fetch/selection", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: JSON.stringify({ all: true, selected: true }),
    }),
  );
  assertEquals(crossOriginReview.status, 403);
});

Deno.test("home page includes security headers and accessible controls", async () => {
  const app = new DistilWebApp({ config: testConfig(), client: new WebClient() });
  const response = await app.handler(new Request("http://localhost/"));
  const content = await response.text();
  assertEquals(response.status, 200);
  assertMatch(response.headers.get("content-security-policy") ?? "", /default-src/);
  assertMatch(content, /aria-live="polite"/);
  assertMatch(content, /data-theme="dark"/);
  assertMatch(content, /data-palette="fasthtml-blue"/);
  assertMatch(content, /--blue-600:#2563eb/);
  assertMatch(content, /--blue-500:#3b82f6/);
  assertMatch(content, /--blue-400:#60a5fa/);
  assertMatch(content, /--bg:#111827/);
  assertMatch(content, /--card:#1f2937/);
  assertMatch(content, /Feed health/);
  assertMatch(content, /Stop and reset/);
  assertMatch(content, /id="generate-progress"/);
  assertMatch(content, /generateProgress\.hidden = false/);
  assertMatch(content, /generateProgress\.hidden = true/);
  assertMatch(content, /Include all/);
  assertMatch(content, /Exclude all/);
  assertMatch(content, /\/api\/fetch\/status/);
  assertMatch(content, /\/api\/fetch\/selection/);
  assertMatch(content, /details\[data-source\]\[open\]/);
  assertMatch(content, /details\.open = openSources\.has\(source\)/);
  assertMatch(content, /review: \{ label: "Review", icon: "\?"/);
  assertMatch(content, /fallback: \{ label: "Fallback", icon: "!"/);
  assertMatch(content, /seen: \{ label: "Seen"/);
  assertMatch(content, /\.review \.tag,\.fallback \.tag/);
  assertMatch(content, /border-style:dashed/);
  assertMatch(content, /icon\.ariaHidden = "true"/);
  const script = content.match(/<script>([\s\S]+)<\/script>/)?.[1];
  if (!script) throw new Error("home page script was missing");
  new Function(script);
});

interface CompletedFetchState {
  status: string;
  result: {
    itemCount: number;
    fetchedCount: number;
    selectedCount: number;
    skippedCount: number;
    unresolvedCount: number;
    items: Array<{ kind: string; reason: string }>;
  };
}

function resolveSelection(
  app: DistilWebApp,
  body: { fingerprint?: string; all?: boolean; selected: boolean },
): Promise<Response> {
  return app.handler(
    new Request("http://localhost/api/fetch/selection", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function completedFetch(app: DistilWebApp): Promise<CompletedFetchState> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await app.handler(new Request("http://localhost/api/fetch/status"));
    const state = await response.json();
    if (state.status !== "running") return state as CompletedFetchState;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("fetch job did not complete");
}

function testConfig(): Config {
  return {
    llm: {
      provider: "ollama",
      model: "qwen2.5:3b",
      baseUrl: "http://127.0.0.1:11434/v1",
      manageLocal: false,
      timeoutMs: 1_000,
      retries: 0,
    },
    decision: {
      enabled: false,
      baseUrl: "http://127.0.0.1:8000",
      confidenceThreshold: 0.9,
      timeoutMs: 1_000,
    },
    output: { directory: "~/distils", readingTimeMinutes: 5 },
    domain: { focus: "research" },
    feeds: [{ url: "https://example.com/rss", name: "Source", type: "rss" }],
  };
}

function testItem(): ContentItem {
  return {
    type: "article",
    source: "Source",
    sourceUrl: "https://example.com/rss",
    title: "Finding",
    content: "Summary",
    link: "https://example.com/item",
    date: "2026-10-08T10:00:00Z",
  };
}
