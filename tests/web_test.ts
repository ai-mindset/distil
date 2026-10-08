import type { ChatClient, ChatMessage, Config, ContentItem } from "../src/types.ts";
import { DistilWebApp } from "../src/web.ts";
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

Deno.test("web fetch and generation share the same pipeline", async () => {
  const historyDirectory = await Deno.makeTempDir();
  try {
    const app = new DistilWebApp({
      config: testConfig(),
      client: new WebClient(),
      historyDirectory,
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
    assertEquals(fetched.status, 200);
    assertEquals((await fetched.json()).itemCount, 1);

    const generated = await app.handler(
      new Request("http://localhost/api/generate", { method: "POST" }),
    );
    assertEquals(generated.status, 200);
    const events = await generated.text();
    assertMatch(events, /event: content/);
    assertMatch(events, /event: complete/);
    const filename = events.match(/"file":"([^"]+)"/)?.[1];
    if (!filename) throw new Error("completion event did not include a filename");

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
});

function testConfig(): Config {
  return {
    llm: {
      provider: "ollama",
      model: "qwen2.5:3b",
      baseUrl: "http://127.0.0.1:11434/v1",
      timeoutMs: 1_000,
      retries: 0,
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
