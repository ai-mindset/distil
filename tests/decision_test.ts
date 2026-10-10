import { StrandsDecisionClient } from "../src/decision.ts";
import type { ContentItem, DecisionConfig } from "../src/types.ts";
import { assertEquals, assertMatch, assertRejects } from "./assert.ts";

const config: DecisionConfig = {
  enabled: true,
  baseUrl: "http://127.0.0.1:8000",
  confidenceThreshold: 0.9,
  timeoutMs: 1_000,
};

Deno.test("Strands client uses the local system-one contract", async () => {
  let requestBody: Record<string, unknown> = {};
  const client = new StrandsDecisionClient(config, async (input, init) => {
    assertEquals(String(input), "http://127.0.0.1:8000/v1/systemone");
    assertEquals(init?.method, "POST");
    assertEquals(init?.redirect, "manual");
    requestBody = JSON.parse(String(init?.body));
    return await Promise.resolve(Response.json({
      model: "strands-decider-2B-hobson-v21",
      answers: {
        selection: {
          type: "choice",
          choice: "include",
          confidence: 0.94,
          probabilities: { include: 0.97, exclude: 0.03 },
        },
      },
    }));
  });

  const verdict = await client.decide(item(), "drug discovery");
  assertEquals(verdict, { choice: "include", confidence: 0.94 });
  assertEquals(
    (requestBody.state as Record<string, unknown>).research_focus,
    "drug discovery",
  );
  const question =
    ((requestBody.questions as Record<string, unknown>).selection) as Record<
      string,
      unknown
    >;
  assertEquals(question.type, "choice");
  assertMatch(String(question.instructions), /only on the supplied/i);
  assertMatch(String(question.instructions), /independently verified/i);
  assertMatch(
    String((question.criteria as Record<string, unknown>).exclude),
    /supplied evidence/i,
  );
});

Deno.test("Strands client validates health and answer schemas", async () => {
  const unhealthy = new StrandsDecisionClient(
    config,
    () => Promise.resolve(new Response("no", { status: 503 })),
  );
  await assertRejects(() => unhealthy.health(), /HTTP 503/);

  const malformed = new StrandsDecisionClient(
    config,
    () => Promise.resolve(Response.json({ answers: { selection: { choice: "maybe" } } })),
  );
  await assertRejects(() => malformed.decide(item(), "research"), /invalid selection/);

  const invalidJson = new StrandsDecisionClient(
    config,
    () => Promise.resolve(new Response("{")),
  );
  await assertRejects(() => invalidJson.decide(item(), "research"), /malformed JSON/);
});

Deno.test("Strands decision state bounds source content", async () => {
  let body = "";
  const client = new StrandsDecisionClient(config, (_input, init) => {
    body = String(init?.body);
    return Promise.resolve(Response.json({
      answers: {
        selection: { type: "choice", choice: "exclude", confidence: 0.91 },
      },
    }));
  });
  await client.decide({ ...item(), content: "x".repeat(20_000) }, "research");
  assertMatch(body, /"content":"x+"/);
  assertEquals(
    ((JSON.parse(body).state as Record<string, unknown>).content as string).length,
    6_000,
  );
});

function item(): ContentItem {
  return {
    type: "article",
    source: "Example",
    sourceUrl: "https://example.com/feed",
    title: "A useful finding",
    content: "Evidence",
    link: "https://example.com/finding",
    date: "2026-10-08T10:00:00Z",
  };
}
