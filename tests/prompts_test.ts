import { generateDistil, streamDistil } from "../src/prompts.ts";
import type { ChatClient, ChatMessage, ContentItem } from "../src/types.ts";
import { assert, assertEquals, assertMatch } from "./assert.ts";

class FakeClient implements ChatClient {
  calls: ChatMessage[][] = [];
  completions: string[] = [];

  complete(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    return Promise.resolve(this.completions.shift() ?? "final");
  }

  async *stream(messages: ChatMessage[]): AsyncIterable<string> {
    this.calls.push(messages);
    yield "final ";
    yield "digest";
  }
}

Deno.test("generates a direct digest for a small item set", async () => {
  const client = new FakeClient();
  client.completions = ["Digest"];
  const result = await generateDistil(client, [item(1)], {
    domain: "biology",
    readingTimeMinutes: 5,
  });

  assertEquals(result, "Digest");
  assertEquals(client.calls.length, 1);
  assertMatch(client.calls[0][0].content, /untrusted data/i);
  assertMatch(client.calls[0][1].content, /https:\/\/example.com\/1/);
});

Deno.test("batches large inputs then consolidates once", async () => {
  const client = new FakeClient();
  client.completions = ["summary one", "summary two", "Consolidated"];
  const stages: string[] = [];
  const result = await generateDistil(
    client,
    [item(1), item(2), item(3), item(4)],
    {
      domain: "biology",
      readingTimeMinutes: 5,
      batchSize: 2,
      onStage: (stage) => stages.push(stage),
    },
  );

  assertEquals(result, "Consolidated");
  assertEquals(client.calls.length, 3);
  assertMatch(client.calls[2][1].content, /summary one/);
  assertEquals(stages, [
    "Summarizing source group 1/2",
    "Summarizing source group 2/2",
    "Generating final digest",
  ]);
});

Deno.test("streaming emits only the final consolidation", async () => {
  const client = new FakeClient();
  client.completions = ["batch one", "batch two"];
  let output = "";
  for await (
    const chunk of streamDistil(client, [item(1), item(2)], {
      domain: "biology",
      readingTimeMinutes: 5,
      batchSize: 1,
    })
  ) {
    output += chunk;
  }
  assertEquals(output, "final digest");
  assert(!output.includes("batch one"));
  assertMatch(client.calls[2][1].content, /batch one/);
});

function item(index: number): ContentItem {
  return {
    type: "article",
    source: "Source",
    sourceUrl: "https://example.com/rss",
    title: `Title ${index}`,
    content: `Content ${index}`,
    link: `https://example.com/${index}`,
    date: "2026-10-08T00:00:00.000Z",
  };
}
