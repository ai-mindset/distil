import { helpText, parseCliArgs } from "../src/cli.ts";
import { assertEquals, assertMatch, assertRejects } from "./assert.ts";

Deno.test("parses run and serve CLI options", () => {
  const run = parseCliArgs(["run", "--config=custom.toml", "--days", "14"]);
  assertEquals(run.command, "run");
  assertEquals(run.config, "custom.toml");
  assertEquals(run.days, 14);

  const serve = parseCliArgs([
    "serve",
    "--host",
    "0.0.0.0",
    "--port=8080",
    "--no-browser",
  ]);
  assertEquals(serve.hostname, "0.0.0.0");
  assertEquals(serve.port, 8080);
  assertEquals(serve.browser, false);
});

Deno.test("rejects unknown and invalid CLI options", async () => {
  await assertRejects(() => parseCliArgs(["unknown"]), /Unknown command/);
  await assertRejects(() => parseCliArgs(["run", "--days", "0"]), /between 1 and 3650/);
  await assertRejects(
    () => parseCliArgs(["serve", "--port", "nope"]),
    /requires an integer/,
  );
});

Deno.test("documents all supported commands", () => {
  const help = helpText();
  assertMatch(help, /distil run/);
  assertMatch(help, /distil serve/);
  assertMatch(help, /distil setup/);
});
