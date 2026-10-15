import { makeTempDir, removeTempDir } from "./temp.ts";
import { test } from "bun:test";
import type { ChatClient, ChatMessage, Config, ContentItem } from "../src/types.ts";
import { editableConfig, setupConfig } from "../src/config.ts";
import { DistilWebApp, handleServerRequest } from "../src/web.ts";
import { historyPage, viewPage } from "../src/web_ui.ts";
import type { SelectionPipeline, SelectionResult } from "../src/selection.ts";
import { assertEquals, assertMatch } from "./assert.ts";

test("Bun server keeps generation streams open while idle", async () => {
  const app = new DistilWebApp({ config: setupConfig(), client: new WebClient() });
  const timeouts: number[] = [];
  const server = {
    timeout: (_request: Request, seconds: number) => timeouts.push(seconds),
  };
  const generation = await handleServerRequest(
    app,
    new Request("http://localhost/api/generate", { method: "POST" }),
    server,
  );
  assertEquals(generation.status, 409);
  await handleServerRequest(app, new Request("http://localhost/health"), server);
  assertEquals(timeouts, [0]);
});

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
        reason:
          index === 0
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

test("web fetch and generation share the same pipeline", async () => {
  const historyDirectory = await makeTempDir();
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
    await removeTempDir(historyDirectory);
  }
});

test("web fetch survives navigation and can be interrupted and reset", async () => {
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

  const settingsDuringFetch = await putConfig(app, editableConfig(testConfig()));
  assertEquals(settingsDuringFetch.status, 409);
  assertMatch((await settingsDuringFetch.json()).error, /current fetch/);

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

test("web requires explicit resolution of uncertain selections", async () => {
  const historyDirectory = await makeTempDir();
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
    assertEquals(
      resolved.result.items.map((item: { kind: string }) => item.kind),
      ["manual", "manual"],
    );

    const generated = await app.handler(
      new Request("http://localhost/api/generate", { method: "POST" }),
    );
    assertEquals(generated.status, 200);
    assertMatch(await generated.text(), /event: complete/);
    assertEquals(selector.marked, 2);
  } finally {
    await removeTempDir(historyDirectory);
  }
});

test("web validates days and confines history paths", async () => {
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

  const crossOriginSettings = await app.handler(
    new Request("http://localhost/api/config", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: JSON.stringify({ config: editableConfig(testConfig()) }),
    }),
  );
  assertEquals(crossOriginSettings.status, 403);
});

test("web settings recover first-run setup and apply a validated configuration", async () => {
  const historyDirectory = await makeTempDir();
  try {
    let saved: Config | undefined;
    let generatedModel = "";
    const app = new DistilWebApp({
      config: setupConfig(),
      configurationIssue: "Config file not found: config.toml",
      clientFactory: (llm) => {
        generatedModel = llm.model;
        return new WebClient();
      },
      selector: new WebSelector(),
      collect: () => Promise.resolve({ items: [testItem()], health: {} }),
      historyDirectory,
      persistConfig: (config) => {
        saved = config;
        return Promise.resolve();
      },
    });

    const before = await app.handler(new Request("http://localhost/"));
    assertMatch(await before.text(), /Finish setting up Distil/);
    const blocked = await app.handler(
      new Request("http://localhost/api/fetch", { method: "POST" }),
    );
    assertEquals(blocked.status, 409);

    const settings = await app.handler(new Request("http://localhost/settings"));
    const settingsHtml = await settings.text();
    assertEquals(settings.status, 200);
    assertMatch(settingsHtml, /What do you want to follow\?/);
    assertMatch(settingsHtml, /Ollama on this computer/);
    assertMatch(settingsHtml, /Add another source/);
    assertMatch(settingsHtml, /The key itself is never saved/);
    assertMatch(settingsHtml, /Service URL <span class="hint">loopback only<\/span>/);
    assertMatch(
      settingsHtml,
      /\.switch-row input \{ flex:0 0 1rem; width:1rem; height:1rem; min-height:1rem;\s+margin:\.25rem 0 0; padding:0;/,
    );
    assertPageScriptsCompile(settingsHtml);

    const initial = await (
      await app.handler(new Request("http://localhost/api/config"))
    ).json();
    assertEquals(initial.configured, false);
    assertEquals(initial.config.feeds, []);

    const invalid = editableConfig(testConfig());
    invalid.feeds = [];
    const invalidResponse = await putConfig(app, invalid);
    assertEquals(invalidResponse.status, 400);
    assertMatch((await invalidResponse.json()).error, /At least one/);

    const valid = editableConfig(testConfig());
    valid.llm.model = "configured-model";
    valid.domain.focus = "accessible research tools";
    valid.feeds[0].name = "Research updates";
    const updated = await putConfig(app, valid);
    assertEquals(updated.status, 200);
    const updatedBody = await updated.json();
    assertEquals(updatedBody.configured, true);
    assertEquals(updatedBody.config.domain.focus, "accessible research tools");
    assertEquals(saved?.domain.focus, "accessible research tools");

    const after = await app.handler(new Request("http://localhost/"));
    assertEquals((await after.text()).includes("Finish setting up Distil"), false);

    await app.handler(new Request("http://localhost/api/fetch", { method: "POST" }));
    await completedFetch(app);
    const generated = await app.handler(
      new Request("http://localhost/api/generate", { method: "POST" }),
    );
    await generated.text();
    assertEquals(generatedModel, "configured-model");
  } finally {
    await removeTempDir(historyDirectory);
  }
});

test("home page includes security headers and accessible controls", async () => {
  const app = new DistilWebApp({ config: testConfig(), client: new WebClient() });
  const response = await app.handler(new Request("http://localhost/"));
  const content = await response.text();
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "no-store");
  assertMatch(response.headers.get("content-security-policy") ?? "", /default-src/);
  assertMatch(content, /aria-live="polite"/);
  assertMatch(content, /data-theme="dark"/);
  assertMatch(content, /data-palette="fasthtml-blue"/);
  assertMatch(content, /<img class="brand-logo"/);
  assertMatch(content, /<link rel="icon"[^>]+distil-logo\.png/);
  assertMatch(content, /class="skip-link" href="#main-content"/);
  assertMatch(content, /<nav class="site-nav" aria-label="Primary">/);
  assertMatch(content, /href="\/" aria-current="page"/);
  assertMatch(content, /aria-label="Dark theme" aria-pressed="true"/);
  assertMatch(content, /prefers-color-scheme: dark/);
  assertMatch(content, /prefers-reduced-motion:no-preference/);
  assertMatch(content, /button:focus-visible,input:focus-visible/);
  assertMatch(content, /@media \(max-width:520px\)/);
  assertMatch(content, /overflow-wrap:anywhere/);
  assertMatch(content, /--blue-600:#2563eb/);
  assertMatch(content, /--blue-500:#3b82f6/);
  assertMatch(content, /--blue-400:#60a5fa/);
  assertMatch(content, /--bg:#0f172a/);
  assertMatch(content, /--card:#1e293b/);
  assertMatch(content, /aria-label="Digest workflow"/);
  assertMatch(content, /id="workflow-collect"[^>]+current/);
  assertMatch(content, /id="workflow-review"[^>]+blocked/);
  assertMatch(content, /id="workflow-generate"[^>]+blocked/);
  assertMatch(content, /id="collect-panel"/);
  assertMatch(content, /id="review-panel"/);
  assertMatch(content, /id="generate-panel"/);
  assertMatch(content, /setWorkflowStep\("review", "current"/);
  assertMatch(content, /id="fetch-items" type="button"/);
  assertEquals(content.includes('id="fetch"'), false);
  assertMatch(content, /window\.fetch\("\/api\/fetch"/);
  assertMatch(content, /fetchStatus\.textContent = "Starting collection\\u2026"/);
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
  assertMatch(content, /details\.open = openSources\.has\(source\).*hasUnresolved/);
  assertMatch(content, /className = "decision-list"/);
  assertMatch(content, /button\.setAttribute\("aria-label", label \+ ": " \+ title\)/);
  assertMatch(content, /new Intl\.DateTimeFormat/);
  assertMatch(content, /review: \{ label: "Review", icon: "\?"/);
  assertMatch(content, /fallback: \{ label: "Fallback", icon: "!"/);
  assertMatch(content, /seen: \{ label: "Seen"/);
  assertMatch(content, /\.review \.tag,\.fallback \.tag/);
  assertMatch(content, /border-style:dashed/);
  assertMatch(content, /icon\.ariaHidden = "true"/);
  assertPageScriptsCompile(content);

  const logo = await app.handler(new Request("http://localhost/assets/distil-logo.png"));
  assertEquals(logo.status, 200);
  assertEquals(logo.headers.get("content-type"), "image/png");
  assertEquals((await logo.arrayBuffer()).byteLength > 1_000, true);
});

test("history and digest pages provide a consistent, safe reading experience", () => {
  const filename = "distil-2026-10-08_120000Z.md";
  const history = historyPage([filename]);
  assertMatch(history, /href="\/history" aria-current="page"/);
  assertMatch(history, /class="history-card"/);
  assertMatch(history, /Digest from October 8, 2026/);
  assertMatch(history, /<time datetime="2026-10-08T12:00:00Z">/);
  assertMatch(history, /id="theme"/);

  const digest = viewPage(
    filename,
    [
      "# Main finding",
      "",
      "A **clear** result with [evidence](https://example.com/report?a=1&b=2).",
      "",
      "- First point",
      "- Second point",
      "",
      "<script>alert('unsafe')</script>",
    ].join("\n"),
  );
  assertMatch(digest, /<article class="digest">/);
  assertMatch(digest, /<h2>Main finding<\/h2>/);
  assertMatch(digest, /<strong>clear<\/strong>/);
  assertMatch(digest, /<ul><li>First point<\/li><li>Second point<\/li><\/ul>/);
  assertMatch(digest, /href="https:\/\/example\.com\/report\?a=1&amp;b=2"/);
  assertMatch(digest, /&lt;script&gt;alert\(&#39;unsafe&#39;\)&lt;\/script&gt;/);
  assertEquals(digest.includes("<script>alert('unsafe')</script>"), false);
  assertMatch(digest, /<summary>View raw Markdown<\/summary>/);
  assertPageScriptsCompile(digest);
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

function assertPageScriptsCompile(html: string): void {
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g));
  if (scripts.length === 0) throw new Error("page script was missing");
  for (const script of scripts) new Function(script[1]);
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

function putConfig(app: DistilWebApp, config: unknown): Promise<Response> {
  return app.handler(
    new Request("http://localhost/api/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
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
