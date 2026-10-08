import { normalizeConfig, parseToml } from "../src/config.ts";
import { assertEquals, assertRejects } from "./assert.ts";

Deno.test("parses and normalizes the existing TOML shape", () => {
  const raw = parseToml(`
    [llm]
    model = "ollama/qwen2.5:3b" # legacy model syntax
    retries = 3

    [output]
    directory = "~/distils"
    reading_time_minutes = 7

    [domain]
    focus = "drug discovery"

    [[feeds]]
    url = "https://example.com/rss"
    name = "Example"
    keywords = ["drug", "protein"]
    max_items = 4
  `);
  const config = normalizeConfig(raw);

  assertEquals(config.llm.provider, "ollama");
  assertEquals(config.llm.model, "qwen2.5:3b");
  assertEquals(config.llm.baseUrl, "http://127.0.0.1:11434/v1");
  assertEquals(config.llm.retries, 3);
  assertEquals(config.output.readingTimeMinutes, 7);
  assertEquals(config.feeds[0].keywords, ["drug", "protein"]);
});

Deno.test("configures Mistral through the OpenAI-compatible transport", () => {
  const config = normalizeConfig(parseToml(`
    [llm]
    provider = "openai"
    model = "mistral-small-latest"
    base_url = "https://api.mistral.ai/v1/"

    [[feeds]]
    url = "https://example.com/feed.xml"
  `));

  assertEquals(config.llm.baseUrl, "https://api.mistral.ai/v1");
  assertEquals(config.llm.apiKeyEnv, "MISTRAL_API_KEY");
  assertEquals(config.llm.provider, "openai");
});

Deno.test("detects YouTube feeds and validates regex patterns", async () => {
  const youtube = normalizeConfig(parseToml(`
    [[feeds]]
    url = "https://www.youtube.com/@example"
    pattern = "research|science"
  `));
  assertEquals(youtube.feeds[0].type, "youtube");

  await assertRejects(
    () =>
      normalizeConfig(parseToml(`
        [[feeds]]
        url = "https://example.com/rss"
        pattern = "["
      `)),
    /not a valid regular expression/,
  );
});

Deno.test("rejects non-http feed URLs", async () => {
  await assertRejects(
    () => normalizeConfig(parseToml('[[feeds]]\nurl = "file:///etc/passwd"')),
    /must use http or https/,
  );
});
