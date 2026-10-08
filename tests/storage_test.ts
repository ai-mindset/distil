import { isDigestFilename, listDigests, readDigest, saveDigest } from "../src/storage.ts";
import { assert, assertEquals, assertRejects } from "./assert.ts";

Deno.test("saves collision-safe digest files and lists newest first", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const now = new Date("2026-10-08T12:34:56Z");
    const first = await saveDigest(directory, "first", now);
    const second = await saveDigest(directory, "second", now);
    assert(first !== second);
    const names = await listDigests(directory);
    assertEquals(names.length, 2);
    assertEquals(
      await readDigest(directory, names.find((name) => name.endsWith("-2.md"))!),
      "second",
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("rejects history traversal", async () => {
  assert(!isDigestFilename("../config.toml"));
  assert(isDigestFilename("distil-2026-10-08_123456Z.md"));
  await assertRejects(
    () => readDigest("/tmp", "../config.toml"),
    /Invalid digest filename/,
  );
});
