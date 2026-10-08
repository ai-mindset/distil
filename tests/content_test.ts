import {
  collectContent,
  fetchRss,
  parseFeed,
  parseVtt,
  parseYoutubeMetadata,
} from "../src/content.ts";
import type { FeedConfig } from "../src/types.ts";
import { assertEquals, assertMatch } from "./assert.ts";

const NOW = new Date("2026-10-08T12:00:00Z");

Deno.test("parses RSS and Atom entries", () => {
  const rss = parseFeed(
    `
    <rss><channel>
      <item>
        <title>Protein &amp; AI</title>
        <link>https://example.com/one</link>
        <pubDate>Wed, 07 Oct 2026 12:00:00 GMT</pubDate>
        <description><![CDATA[<p>A useful abstract.</p>]]></description>
      </item>
    </channel></rss>
  `,
    NOW,
  );
  assertEquals(rss[0].title, "Protein & AI");
  assertEquals(rss[0].summary, "A useful abstract.");

  const atom = parseFeed(
    `
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Atom title</title>
        <link rel="alternate" href="https://example.com/atom"/>
        <updated>2026-10-08T09:00:00Z</updated>
        <summary>Atom summary</summary>
      </entry>
    </feed>
  `,
    NOW,
  );
  assertEquals(atom[0].link, "https://example.com/atom");
});

Deno.test("filters RSS by date, keywords, regex, and item limit", async () => {
  const feed: FeedConfig = {
    url: "https://example.com/rss",
    name: "Research",
    type: "rss",
    keywords: ["protein"],
    pattern: "(?i)breakthrough",
    maxItems: 1,
  };
  const xml = `
    <rss><channel>
      <item><title>Protein breakthrough</title><link>https://e/1</link>
        <pubDate>2026-10-08T10:00:00Z</pubDate><description>Keep</description></item>
      <item><title>Protein old breakthrough</title><link>https://e/2</link>
        <pubDate>2026-09-01T10:00:00Z</pubDate><description>Old</description></item>
      <item><title>Protein routine</title><link>https://e/3</link>
        <pubDate>2026-10-08T10:00:00Z</pubDate><description>Skip</description></item>
    </channel></rss>
  `;
  const result = await fetchRss(feed, {
    daysBack: 7,
    timeoutMs: 100,
    now: NOW,
    fetcher: () => Promise.resolve(new Response(xml)),
  });

  assertEquals(result.items.map((item) => item.link), ["https://e/1"]);
  assertEquals(result.health.totalEntries, 3);
  assertEquals(result.health.filteredEntries, 1);
});

Deno.test("reports feed errors without failing the whole collection", async () => {
  const feeds: FeedConfig[] = [
    { url: "https://good/rss", name: "Good", type: "rss" },
    { url: "https://bad/rss", name: "Bad", type: "rss" },
  ];
  const result = await collectContent(feeds, {
    now: NOW,
    fetcher: (input) => {
      if (String(input).includes("bad")) {
        return Promise.resolve(new Response("down", { status: 503 }));
      }
      return Promise.resolve(
        new Response(`
        <rss><channel><item><title>Good</title><link>https://item</link>
        <description>Summary</description></item></channel></rss>
      `),
      );
    },
  });

  assertEquals(result.items.length, 1);
  assertEquals(result.health.Good.status, "success");
  assertEquals(result.health.Bad.status, "error");
  assertMatch(result.health.Bad.message, /503/);
});

Deno.test("limits concurrent source collection", async () => {
  const feeds: FeedConfig[] = Array.from({ length: 10 }, (_, index) => ({
    url: `https://youtube.com/watch?v=${index}`,
    name: `Video ${index}`,
    type: "youtube",
  }));
  let active = 0;
  let maximum = 0;
  await collectContent(feeds, {
    now: NOW,
    youtubeCollector: async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return [];
    },
  });
  assertEquals(maximum, 4);
});

Deno.test("rejects oversized feeds without trusting content-length", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1));
      controller.close();
    },
  });
  const result = await fetchRss(
    { url: "https://example.com/large", name: "Large", type: "rss" },
    {
      daysBack: 7,
      timeoutMs: 100,
      now: NOW,
      fetcher: () => Promise.resolve(new Response(body)),
    },
  );
  assertEquals(result.health.status, "error");
  assertMatch(result.health.message, /5 MiB/);
});

Deno.test("deduplicates links across sources", async () => {
  const feeds: FeedConfig[] = [
    { url: "https://one/rss", name: "One", type: "rss" },
    { url: "https://two/rss", name: "Two", type: "rss" },
  ];
  const xml = "<rss><channel><item><title>Same</title><link>https://same</link>" +
    "<description>Summary</description></item></channel></rss>";
  const result = await collectContent(feeds, {
    now: NOW,
    fetcher: () => Promise.resolve(new Response(xml)),
  });
  assertEquals(result.items.length, 1);
});

Deno.test("confines article links to HTTP and resolves relative URLs", async () => {
  const feed: FeedConfig = {
    url: "https://example.com/path/feed.xml",
    name: "Safe",
    type: "rss",
  };
  const xml = `<rss><channel>
    <item><title>Relative</title><link>/article</link></item>
    <item><title>Unsafe</title><link>javascript:alert(1)</link></item>
  </channel></rss>`;
  const result = await fetchRss(feed, {
    daysBack: 7,
    timeoutMs: 100,
    now: NOW,
    fetcher: () => Promise.resolve(new Response(xml)),
  });
  assertEquals(result.items[0].link, "https://example.com/article");
  assertEquals(result.items[1].link, feed.url);
});

Deno.test("parses VTT captions and removes repeated rolling captions", () => {
  const text = parseVtt(`
    WEBVTT

    00:00:00.000 --> 00:00:01.000
    Hello <c>world</c>

    00:00:01.000 --> 00:00:02.000
    Hello <c>world</c>

    00:00:02.000 --> 00:00:03.000
    New line
  `);
  assertEquals(text, "Hello world New line");
});

Deno.test("parses safe YouTube title, link, and upload metadata", () => {
  const metadata = parseYoutubeMetadata(
    "abc123\tResearch title\thttps://youtube.com/watch?v=abc123\t20261007\n" +
      "bad\tUnsafe\tjavascript:alert(1)\tNA",
  );
  assertEquals(metadata.get("abc123"), {
    id: "abc123",
    title: "Research title",
    link: "https://youtube.com/watch?v=abc123",
    published: "2026-10-07T00:00:00.000Z",
  });
  assertEquals(metadata.get("bad")?.link, "");
});
