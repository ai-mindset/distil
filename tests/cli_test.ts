import { helpText, parseCliArgs, VERSION } from "../src/cli.ts";
import { assertEquals, assertMatch, assertRejects } from "./assert.ts";

Deno.test("parses run and serve CLI options", () => {
  const run = parseCliArgs([
    "run",
    "--config=custom.toml",
    "--days",
    "14",
    "--review-policy=exclude",
  ]);
  assertEquals(run.command, "run");
  assertEquals(run.config, "custom.toml");
  assertEquals(run.days, 14);
  assertEquals(run.reviewPolicy, "exclude");

  const preview = parseCliArgs(["preview", "--include-seen"]);
  assertEquals(preview.command, "preview");
  assertEquals(preview.includeSeen, true);

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
  await assertRejects(
    () => parseCliArgs(["run", "--review-policy", "maybe"]),
    /must be include or exclude/,
  );
  await assertRejects(
    () => parseCliArgs(["preview", "--review-policy", "include"]),
    /only valid with the run command/,
  );
});

Deno.test("documents all supported commands", () => {
  const help = helpText();
  assertMatch(help, /distil run/);
  assertMatch(help, /distil preview/);
  assertMatch(help, /distil serve/);
  assertMatch(help, /distil setup/);
  assertMatch(help, /--review-policy/);
});

Deno.test("keeps the CLI and package versions in sync", async () => {
  const manifest = JSON.parse(
    await Deno.readTextFile(new URL("../deno.json", import.meta.url)),
  );
  assertEquals(VERSION, manifest.version);
});
