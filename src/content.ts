import type {
  CollectionResult,
  ContentItem,
  FeedConfig,
  FeedHealth,
  FetchLike,
} from "./types.ts";
import {
  child,
  children,
  nodeText,
  parseXml,
  textFromHtml,
  type XmlNode,
} from "./xml.ts";

const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;
const SOURCE_CONCURRENCY = 4;

interface ParsedEntry {
  title: string;
  link: string;
  published: Date;
  summary: string;
}

export interface CollectionOptions {
  daysBack?: number;
  timeoutMs?: number;
  transcriptDirectory?: string;
  fetcher?: FetchLike;
  now?: Date;
  youtubeCollector?: (
    feed: FeedConfig,
    options: YoutubeOptions,
  ) => Promise<ContentItem[]>;
}

export interface YoutubeOptions {
  daysBack: number;
  outputDirectory: string;
  now: Date;
}

export interface YoutubeMetadata {
  id: string;
  title: string;
  link: string;
  published?: string;
}

export async function collectContent(
  feeds: FeedConfig[],
  options: CollectionOptions = {},
): Promise<CollectionResult> {
  const daysBack = positiveDays(options.daysBack ?? 7);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const now = options.now ?? new Date();
  const fetcher = options.fetcher ?? fetch;
  const youtubeCollector = options.youtubeCollector ?? collectYoutubeTranscripts;
  const transcriptDirectory = options.transcriptDirectory ?? "transcripts";

  const results = await mapConcurrent(feeds, SOURCE_CONCURRENCY, async (feed) => {
    if (feed.type === "youtube") {
      const started = performance.now();
      try {
        const items = await youtubeCollector(feed, {
          daysBack,
          outputDirectory: transcriptDirectory,
          now,
        });
        const health: FeedHealth = {
          url: feed.url,
          status: items.length > 0 ? "success" : "empty",
          message: items.length > 0 ? "" : "No transcripts found",
          totalEntries: items.length,
          filteredEntries: items.length,
          fetchTimeMs: performance.now() - started,
          keywords: feed.keywords,
          maxItems: feed.maxItems,
        };
        return { feed, items, health };
      } catch (error) {
        return {
          feed,
          items: [],
          health: errorHealth(feed, error, performance.now() - started),
        };
      }
    }
    return await fetchRss(feed, { daysBack, timeoutMs, fetcher, now });
  });

  const health: Record<string, FeedHealth> = {};
  const items: ContentItem[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    health[uniqueHealthKey(health, result.feed.name)] = result.health;
    for (const item of result.items) {
      const key = item.link || `${item.source}:${item.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    }
  }
  items.sort((left, right) => right.date.localeCompare(left.date));
  return { items, health };
}

export async function fetchRss(
  feed: FeedConfig,
  options: {
    daysBack: number;
    timeoutMs: number;
    fetcher?: FetchLike;
    now?: Date;
  },
): Promise<{ feed: FeedConfig; items: ContentItem[]; health: FeedHealth }> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? new Date();
  const started = performance.now();

  try {
    const response = await fetcher(feed.url, {
      headers: {
        accept: "application/atom+xml, application/rss+xml, application/xml, text/xml",
        "user-agent": "distil/0.2 (+https://github.com/ai-mindset/distil)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Feed returned HTTP ${response.status}`);
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_FEED_BYTES) {
      throw new Error("Feed exceeds the 5 MiB size limit");
    }
    const xml = await readLimitedText(response, MAX_FEED_BYTES);

    const parsed = parseFeed(xml, now);
    const cutoff = new Date(now.getTime() - positiveDays(options.daysBack) * 86_400_000);
    const pattern = feed.pattern
      ? new RegExp(feed.pattern.replace(/^\(\?i\)/, ""), "i")
      : undefined;
    const filtered = parsed.filter((entry) => {
      if (entry.published < cutoff) return false;
      const searchable = `${entry.title} ${entry.summary}`;
      if (
        feed.keywords?.length &&
        !feed.keywords.some((keyword) =>
          searchable.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())
        )
      ) {
        return false;
      }
      return !pattern || pattern.test(searchable);
    });
    const selected = feed.maxItems ? filtered.slice(0, feed.maxItems) : filtered;
    const items = selected.map((entry): ContentItem => ({
      type: "article",
      source: feed.name,
      sourceUrl: feed.url,
      title: entry.title,
      content: entry.summary.slice(0, 2_000),
      link: safeHttpLink(entry.link, feed.url),
      date: entry.published.toISOString(),
    }));
    const health: FeedHealth = {
      url: feed.url,
      status: items.length > 0 ? "success" : "empty",
      message: items.length > 0
        ? ""
        : `No items matched filters (found ${parsed.length} total)`,
      totalEntries: parsed.length,
      filteredEntries: items.length,
      fetchTimeMs: performance.now() - started,
      keywords: feed.keywords,
      maxItems: feed.maxItems,
    };
    return { feed, items, health };
  } catch (error) {
    return {
      feed,
      items: [],
      health: errorHealth(feed, error, performance.now() - started),
    };
  }
}

export function parseFeed(xml: string, now = new Date()): ParsedEntry[] {
  const root = parseXml(xml);
  let entryNodes: XmlNode[];
  if (root.name === "rss") {
    const channel = child(root, "channel");
    if (!channel) throw new Error("RSS feed is missing its channel");
    entryNodes = children(channel, "item");
  } else if (root.name === "feed") {
    entryNodes = children(root, "entry");
  } else {
    entryNodes = children(root, "item");
  }

  return entryNodes.map((entry, index) => {
    const title = cleanText(nodeText(child(entry, "title"))) ||
      `Untitled item ${index + 1}`;
    const link = entryLink(entry);
    const summaryNode = child(entry, "description", "summary", "content", "encoded");
    const summary = textFromHtml(nodeText(summaryNode));
    const dateValue = nodeText(child(entry, "pubdate", "published", "updated", "date"));
    const published = dateValue ? new Date(dateValue) : new Date(now);
    return {
      title,
      link,
      summary,
      published: Number.isNaN(published.valueOf()) ? new Date(now) : published,
    };
  });
}

export function parseVtt(source: string): string {
  const captions: string[] = [];
  for (const block of source.replace(/^\uFEFF/, "").split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0 || lines[0] === "WEBVTT" || lines[0].startsWith("NOTE")) {
      continue;
    }
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) continue;
    const text = textFromHtml(lines.slice(timing + 1).join(" "));
    if (text && captions.at(-1) !== text) captions.push(text);
  }
  return captions.join(" ");
}

export async function collectYoutubeTranscripts(
  feed: FeedConfig,
  options: YoutubeOptions,
): Promise<ContentItem[]> {
  const directory = `${options.outputDirectory}/${safeSegment(feed.name)}-${
    options.now.toISOString().replaceAll(":", "-")
  }`;
  await Deno.mkdir(directory, { recursive: true });
  const args = [
    "--write-subs",
    "--write-auto-subs",
    "--skip-download",
    "--sub-langs",
    "en.*,en",
    "--sub-format",
    "vtt",
    "--playlist-end",
    String(feed.maxItems ?? 10),
    "--dateafter",
    `now-${positiveDays(options.daysBack)}days`,
    "--print",
    "%(id)s\t%(title)s\t%(webpage_url)s\t%(upload_date)s",
    "--no-progress",
    "--output",
    `${directory}/%(id)s.%(ext)s`,
    "--no-warnings",
    "--ignore-errors",
    feed.url,
  ];

  let output: Deno.CommandOutput;
  try {
    output = await new Deno.Command("yt-dlp", {
      args,
      stdout: "piped",
      stderr: "piped",
    }).output();
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error("yt-dlp is required for YouTube sources but was not found");
    }
    throw error;
  }
  if (!output.success) {
    const details = new TextDecoder().decode(output.stderr).trim();
    throw new Error(`yt-dlp failed${details ? `: ${details}` : ""}`);
  }

  const metadata = parseYoutubeMetadata(new TextDecoder().decode(output.stdout));
  const files: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    if (entry.isFile && entry.name.endsWith(".vtt")) files.push(entry.name);
  }
  files.sort();
  const items: ContentItem[] = [];
  const seenIds = new Set<string>();
  for (const name of files) {
    const id = name.split(".", 1)[0];
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const file = `${directory}/${name}`;
    if ((await Deno.stat(file)).size > MAX_TRANSCRIPT_BYTES) continue;
    const content = parseVtt(await Deno.readTextFile(file));
    if (!content) continue;
    const details = metadata.get(id);
    items.push({
      type: "video",
      source: feed.name,
      sourceUrl: feed.url,
      title: details?.title || id,
      content: content.slice(0, 5_000),
      link: details?.link || feed.url,
      date: details?.published || options.now.toISOString(),
    });
  }
  return feed.maxItems ? items.slice(0, feed.maxItems) : items;
}

export function parseYoutubeMetadata(source: string): Map<string, YoutubeMetadata> {
  const result = new Map<string, YoutubeMetadata>();
  for (const line of source.split(/\r?\n/)) {
    const [id, title, link, uploadDate] = line.split("\t");
    if (!id || !title) continue;
    let safeLink = "";
    try {
      const url = new URL(link);
      if (url.protocol === "http:" || url.protocol === "https:") safeLink = url.href;
    } catch {
      // Fall back to the configured source URL.
    }
    result.set(id, {
      id,
      title,
      link: safeLink,
      published: parseUploadDate(uploadDate),
    });
  }
  return result;
}

function entryLink(entry: XmlNode): string {
  const links = children(entry, "link");
  const alternate = links.find((link) =>
    !link.attributes.rel || link.attributes.rel === "alternate"
  );
  return alternate?.attributes.href || nodeText(alternate) ||
    nodeText(child(entry, "guid", "id"));
}

function cleanText(value: string): string {
  return textFromHtml(value);
}

function safeHttpLink(value: string, fallback: string): string {
  try {
    const url = new URL(value, fallback);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function errorHealth(feed: FeedConfig, error: unknown, elapsed: number): FeedHealth {
  const message = error instanceof Error ? error.message : String(error);
  const timedOut = error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError");
  return {
    url: feed.url,
    status: timedOut ? "timeout" : "error",
    message,
    totalEntries: 0,
    filteredEntries: 0,
    fetchTimeMs: elapsed,
    keywords: feed.keywords,
    maxItems: feed.maxItems,
  };
}

function uniqueHealthKey(health: Record<string, FeedHealth>, name: string): string {
  if (!(name in health)) return name;
  let suffix = 2;
  while (`${name} (${suffix})` in health) suffix++;
  return `${name} (${suffix})`;
}

function positiveDays(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error("daysBack must be an integer between 1 and 3650");
  }
  return value;
}

function safeSegment(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") ||
    "youtube";
}

function parseUploadDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{8}$/.test(value)) return undefined;
  const date = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`,
  );
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

async function readLimitedText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("size limit exceeded");
        throw new Error("Feed exceeds the 5 MiB size limit");
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function mapConcurrent<T, R>(
  values: T[],
  limit: number,
  action: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= values.length) return;
        results[index] = await action(values[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
