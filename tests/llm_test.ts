import { OpenAICompatibleClient } from "../src/llm.ts";
import type { LlmConfig } from "../src/types.ts";
import { assertEquals, assertMatch } from "./assert.ts";

const config: LlmConfig = {
  provider: "openai",
  model: "mistral-small-latest",
  baseUrl: "https://api.mistral.ai/v1",
  apiKeyEnv: "MISTRAL_API_KEY",
  timeoutMs: 1_000,
  retries: 1,
};

Deno.test("sends OpenAI-compatible requests accepted by Mistral and 9Router", async () => {
  let capturedUrl = "";
  let capturedAuth = "";
  let capturedBody: Record<string, unknown> = {};
  const client = new OpenAICompatibleClient(config, {
    apiKey: "secret",
    fetcher: async (input, init) => {
      capturedUrl = String(input);
      capturedAuth = new Headers(init?.headers).get("authorization") ?? "";
      capturedBody = JSON.parse(String(init?.body));
      return await Promise.resolve(Response.json({
        choices: [{ message: { content: "Digest" } }],
      }));
    },
  });

  const result = await client.complete([{ role: "user", content: "Summarize" }]);
  assertEquals(result, "Digest");
  assertEquals(capturedUrl, "https://api.mistral.ai/v1/chat/completions");
  assertEquals(capturedAuth, "Bearer secret");
  assertEquals(capturedBody.model, "mistral-small-latest");
  assertEquals(capturedBody.stream, false);
});

Deno.test("parses split OpenAI streaming events", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel'));
      controller.enqueue(
        encoder.encode('lo"}}]}\r'),
      );
      controller.enqueue(
        encoder.encode('\n\r\ndata: {"choices":[{"delta":{"content":"!"}}]}\n\n'),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  const client = new OpenAICompatibleClient(config, {
    apiKey: "secret",
    fetcher: () =>
      Promise.resolve(
        new Response(body, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
  });

  let output = "";
  for await (const chunk of client.stream([{ role: "user", content: "Hi" }])) {
    output += chunk;
  }
  assertEquals(output, "Hello!");
});

Deno.test("retries transient provider errors", async () => {
  let calls = 0;
  const client = new OpenAICompatibleClient(config, {
    apiKey: "secret",
    sleep: () => Promise.resolve(),
    fetcher: () => {
      calls++;
      return Promise.resolve(
        calls === 1
          ? new Response("busy", { status: 503 })
          : Response.json({ choices: [{ message: { content: "Recovered" } }] }),
      );
    },
  });

  assertEquals(await client.complete([{ role: "user", content: "Hi" }]), "Recovered");
  assertEquals(calls, 2);
});

Deno.test("supports array content returned by compatible providers", async () => {
  const client = new OpenAICompatibleClient(config, {
    apiKey: "secret",
    fetcher: () =>
      Promise.resolve(Response.json({
        choices: [{ message: { content: [{ type: "text", text: "Part one" }, " two"] } }],
      })),
  });
  assertEquals(
    await client.complete([{ role: "user", content: "Hi" }]),
    "Part one two",
  );
});

Deno.test("supports unauthenticated local OpenAI-compatible proxies", async () => {
  let authorization: string | null = "unexpected";
  const client = new OpenAICompatibleClient({
    ...config,
    baseUrl: "http://127.0.0.1:20128/v1",
    apiKeyEnv: undefined,
  }, {
    fetcher: (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization");
      return Promise.resolve(Response.json({
        choices: [{ message: { content: "Local response" } }],
      }));
    },
  });
  assertEquals(
    await client.complete([{ role: "user", content: "Hi" }]),
    "Local response",
  );
  assertEquals(authorization, null);
});

Deno.test("requires a configured provider API key", () => {
  try {
    new OpenAICompatibleClient(config, { getEnv: () => undefined });
    throw new Error("client should not have been created");
  } catch (error) {
    assertMatch((error as Error).message, /MISTRAL_API_KEY/);
  }
});
