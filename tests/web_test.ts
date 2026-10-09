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
  assertMatch(content, /\/api\/fetch\/status/);
  assertMatch(content, /review: \{ label: "Review"/);
  assertMatch(content, /fallback: \{ label: "Fallback"/);
  assertMatch(content, /seen: \{ label: "Seen"/);
  const script = content.match(/<script>([\s\S]+)<\/script>/)?.[1];
  if (!script) throw new Error("home page script was missing");
  new Function(script);
});

interface CompletedFetchState {
  status: string;
  result: {
    itemCount: number;
    fetchedCount: number;
    items: Array<{ reason: string }>;
  };
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
