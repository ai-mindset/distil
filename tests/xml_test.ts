import { child, children, nodeText, parseXml, textFromHtml } from "../src/xml.ts";
import { assertEquals, assertRejects } from "./assert.ts";

Deno.test("parses namespaced XML, CDATA, attributes, and entities", () => {
  const root = parseXml(`
    <?xml version="1.0"?>
    <feed xmlns:a="urn:test">
      <a:entry id="1"><title><![CDATA[A <useful> title]]></title></a:entry>
      <entry id="2"><title>Fish &amp; Chips</title></entry>
    </feed>
  `);
  const entries = children(root, "entry");
  assertEquals(entries.length, 2);
  assertEquals(entries[0].attributes.id, "1");
  assertEquals(nodeText(child(entries[0], "title")), "A <useful> title");
  assertEquals(nodeText(child(entries[1], "title")), "Fish & Chips");
});

Deno.test("rejects doctypes and malformed nesting", async () => {
  await assertRejects(() => parseXml("<!DOCTYPE x><x/>"), /DOCTYPE/);
  await assertRejects(() => parseXml("<x><y></x>"), /unexpected closing tag/);
});

Deno.test("turns HTML summaries into compact plain text", () => {
  assertEquals(
    textFromHtml("<p>Hello&nbsp; <strong>world</strong></p><script>bad()</script>"),
    "Hello world",
  );
});
