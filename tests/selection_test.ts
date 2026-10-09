import type { DecisionClient, DecisionVerdict } from "../src/decision.ts";
import {
  ContentSelector,
  FileSeenStore,
  itemFingerprint,
  type SeenStore,
} from "../src/selection.ts";
import type { ContentItem, DecisionConfig, ProgressUpdate } from "../src/types.ts";
import { assertEquals, assertMatch } from "./assert.ts";

const config: DecisionConfig = {
  enabled: true,
  baseUrl: "http://127.0.0.1:8000",
  confidenceThreshold: 0.9,
  timeoutMs: 1_000,
};

class MemorySeenStore implements SeenStore {
  seen = new Set<string>();

  load(): Promise<Set<string>> {
    return Promise.resolve(new Set(this.seen));
  }

  add(fingerprints: string[]): Promise<void> {
    for (const fingerprint of fingerprints) this.seen.add(fingerprint);
    return Promise.resolve();
  }
}

class FakeDecisionClient implements DecisionClient {
  verdicts: DecisionVerdict[] = [];
  healthError?: Error;

  health(): Promise<void> {
    return this.healthError ? Promise.reject(this.healthError) : Promise.resolve();
  }

  decide(): Promise<DecisionVerdict> {
    const verdict = this.verdicts.shift();
    if (!verdict) throw new Error("missing fake verdict");
    return Promise.resolve(verdict);
  }
}

Deno.test("selection skips seen items and trusts only confident Strands choices", async () => {
  const store = new MemorySeenStore();
  store.seen.add(await itemFingerprint(item(1)));
  const decisions = new FakeDecisionClient();
  decisions.verdicts = [
    { choice: "include", confidence: 0.95 },
    { choice: "exclude", confidence: 0.93 },
    { choice: "exclude", confidence: 0.55 },
  ];
  const selector = new ContentSelector(config, "research", {
    seenStore: store,
    decisionClient: decisions,
  });

  const progress: ProgressUpdate[] = [];
  const result = await selector.select([item(1), item(2), item(3), item(4)], {
    onProgress: (update) => progress.push(update),
  });
  assertEquals(result.items.map((entry) => entry.kind), [
    "seen",
    "selected",
    "excluded",
    "review",
  ]);
  assertEquals(result.selected.map((entry) => entry.title), ["Title 2", "Title 4"]);
  assertEquals(
    result.items[3].reason,
    "Strands leaned exclude with 55% confidence in its relevance classification; included conservatively and marked Review because this is below the 90% decision threshold",
  );
  assertEquals(progress.at(-1)?.completed, 4);
  assertMatch(progress.at(-1)?.message ?? "", /leaned exclude/);

  await selector.markReviewed(result, new Date("2026-10-08T12:00:00Z"));
  assertEquals(store.seen.size, 4);
});

Deno.test("selection reports uncertain include and boundary decisions accurately", async () => {
  const decisions = new FakeDecisionClient();
  decisions.verdicts = [
    { choice: "include", confidence: 0.899 },
    { choice: "exclude", confidence: 0.9 },
  ];
  const selector = new ContentSelector(config, "research", {
    seenStore: new MemorySeenStore(),
    decisionClient: decisions,
  });

  const result = await selector.select([item(1), item(2)]);
  assertEquals(result.items.map((entry) => entry.kind), ["review", "excluded"]);
  assertEquals(result.items.map((entry) => entry.selected), [true, false]);
  assertEquals(
    result.items[0].reason,
    "Strands leaned include with 89.9% confidence in its relevance classification; included conservatively and marked Review because this is below the 90% decision threshold",
  );
  assertEquals(
    result.items[1].reason,
    "Strands chose exclude with 90% confidence in its relevance classification",
  );
});

Deno.test("selection fails open when the local decision service is unavailable", async () => {
  const decisions = new FakeDecisionClient();
  decisions.healthError = new Error("connection refused");
  const selector = new ContentSelector(config, "research", {
    seenStore: new MemorySeenStore(),
    decisionClient: decisions,
  });

  const result = await selector.select([item(1), item(2)]);
  assertEquals(result.selected.length, 2);
  assertEquals(result.items.map((entry) => entry.kind), ["fallback", "fallback"]);
  assertMatch(result.warning ?? "", /connection refused/);
});

Deno.test("file seen store persists normalized item fingerprints", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const store = new FileSeenStore(`${directory}/state/seen.json`);
    const tracked = item(1);
    tracked.link = "https://example.com/1?utm_source=newsletter&b=2&a=1#section";
    const equivalent = item(1);
    equivalent.link = "https://example.com/1?a=1&b=2";
    const fingerprint = await itemFingerprint(tracked);
    assertEquals(fingerprint, await itemFingerprint(equivalent));

    await store.add([fingerprint], new Date("2026-10-08T12:00:00Z"));
    assertEquals((await store.load()).has(fingerprint), true);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

function item(index: number): ContentItem {
  return {
    type: "article",
    source: "Source",
    sourceUrl: "https://example.com/rss",
    title: `Title ${index}`,
    content: `Content ${index}`,
    link: `https://example.com/${index}`,
    date: "2026-10-08T10:00:00Z",
  };
}
