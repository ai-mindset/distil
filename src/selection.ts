import {
  type DecisionClient,
  type DecisionVerdict,
  StrandsDecisionClient,
} from "./decision.ts";
import type { ContentItem, DecisionConfig, FetchLike, ProgressUpdate } from "./types.ts";

export const DEFAULT_SEEN_STATE_PATH = ".distil/state.json";
const STATE_VERSION = 1;
const MAX_SEEN_ITEMS = 20_000;

export type SelectionKind = "selected" | "excluded" | "review" | "seen" | "fallback";

export interface ItemSelection {
  item: ContentItem;
  fingerprint: string;
  selected: boolean;
  kind: SelectionKind;
  reason: string;
  confidence?: number;
}

export interface SelectionResult {
  items: ItemSelection[];
  selected: ContentItem[];
  warning?: string;
}

export interface SeenStore {
  load(): Promise<Set<string>>;
  add(fingerprints: string[], now?: Date): Promise<void>;
}

export interface SelectionPipeline {
  select(items: ContentItem[], options?: SelectionOptions): Promise<SelectionResult>;
  markReviewed(result: SelectionResult, now?: Date): Promise<void>;
}

export interface SelectionOptions {
  includeSeen?: boolean;
  signal?: AbortSignal;
  onProgress?: (update: ProgressUpdate) => void;
}

export interface SelectorDependencies {
  decisionClient?: DecisionClient;
  fetcher?: FetchLike;
  seenStore?: SeenStore;
}

export class ContentSelector implements SelectionPipeline {
  readonly #config: DecisionConfig;
  readonly #focus: string;
  readonly #decisionClient: DecisionClient;
  readonly #seenStore: SeenStore;

  constructor(
    config: DecisionConfig,
    focus: string,
    dependencies: SelectorDependencies = {},
  ) {
    this.#config = config;
    this.#focus = focus;
    this.#decisionClient = dependencies.decisionClient ??
      new StrandsDecisionClient(config, dependencies.fetcher);
    this.#seenStore = dependencies.seenStore ?? new FileSeenStore();
  }

  async select(
    items: ContentItem[],
    options: SelectionOptions = {},
  ): Promise<SelectionResult> {
    options.signal?.throwIfAborted();
    const seen = await this.#seenStore.load();
    const fingerprints = await Promise.all(items.map(itemFingerprint));
    const selections: ItemSelection[] = [];
    const candidates: Array<{ item: ContentItem; fingerprint: string }> = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const fingerprint = fingerprints[index];
      if (!options.includeSeen && seen.has(fingerprint)) {
        selections.push({
          item,
          fingerprint,
          selected: false,
          kind: "seen",
          reason: "Already included in a completed run",
        });
      } else {
        candidates.push({ item, fingerprint });
      }
    }

    let completed = items.length - candidates.length;
    options.onProgress?.({
      stage: "selecting",
      completed,
      total: items.length,
      message: this.#config.enabled
        ? "Checking the local Strands service"
        : "Strands selection is disabled; including new items",
    });

    if (candidates.length === 0) {
      options.onProgress?.({
        stage: "selecting",
        completed: items.length,
        total: items.length,
        message: "No new items to select",
      });
      return resultInInputOrder(selections, fingerprints);
    }

    if (!this.#config.enabled) {
      selections.push(...candidates.map(({ item, fingerprint }) => ({
        item,
        fingerprint,
        selected: true,
        kind: "selected" as const,
        reason: "New item; Strands selection is disabled",
      })));
      options.onProgress?.({
        stage: "selecting",
        completed: items.length,
        total: items.length,
        message: `Selected ${candidates.length} new item(s)`,
      });
      return resultInInputOrder(selections, fingerprints);
    }

    let warning: string | undefined;
    try {
      await this.#decisionClient.health(options.signal);
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      warning = `Strands unavailable; included new items by safe fallback: ${
        message(error)
      }`;
      selections.push(...fallbackSelections(candidates, warning));
      options.onProgress?.({
        stage: "selecting",
        completed: items.length,
        total: items.length,
        message: warning,
      });
      return resultInInputOrder(selections, fingerprints, warning);
    }

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      options.signal?.throwIfAborted();
      try {
        const verdict = await this.#decisionClient.decide(
          candidate.item,
          this.#focus,
          options.signal,
        );
        const selection = selectionFromVerdict(candidate, verdict, this.#config);
        selections.push(selection);
        completed++;
        options.onProgress?.({
          stage: "selecting",
          completed,
          total: items.length,
          message: `${candidate.item.title}: ${selection.reason}`,
        });
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
        warning = `Strands failed; included undecided items by safe fallback: ${
          message(error)
        }`;
        selections.push(...fallbackSelections(candidates.slice(index), warning));
        options.onProgress?.({
          stage: "selecting",
          completed: items.length,
          total: items.length,
          message: warning,
        });
        break;
      }
    }
    return resultInInputOrder(selections, fingerprints, warning);
  }

  async markReviewed(result: SelectionResult, now = new Date()): Promise<void> {
    const reviewed = result.items
      .filter((selection) => selection.kind !== "seen")
      .map((selection) => selection.fingerprint);
    if (reviewed.length > 0) await this.#seenStore.add(reviewed, now);
  }
}

export class FileSeenStore implements SeenStore {
  readonly #path: string;

  constructor(path = DEFAULT_SEEN_STATE_PATH) {
    this.#path = path;
  }

  async load(): Promise<Set<string>> {
    const state = await this.#read();
    return new Set(Object.keys(state.seen));
  }

  async add(fingerprints: string[], now = new Date()): Promise<void> {
    const state = await this.#read();
    const timestamp = now.toISOString();
    for (const fingerprint of fingerprints) state.seen[fingerprint] = timestamp;
    const entries = Object.entries(state.seen)
      .sort((left, right) => right[1].localeCompare(left[1]))
      .slice(0, MAX_SEEN_ITEMS);
    await this.#write({ version: STATE_VERSION, seen: Object.fromEntries(entries) });
  }

  async #read(): Promise<SeenState> {
    let text: string;
    try {
      text = await Deno.readTextFile(this.#path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return emptyState();
      throw error;
    }
    try {
      const value = JSON.parse(text) as unknown;
      const state = asRecord(value);
      if (!isRecord(state.seen)) throw new Error();
      const seen = state.seen;
      if (
        state.version !== STATE_VERSION ||
        Object.values(seen).some((timestamp) => typeof timestamp !== "string")
      ) {
        throw new Error();
      }
      return { version: STATE_VERSION, seen: seen as Record<string, string> };
    } catch {
      throw new Error(`Invalid seen-item state: ${this.#path}`);
    }
  }

  async #write(state: SeenState): Promise<void> {
    await Deno.mkdir(parentDirectory(this.#path), { recursive: true });
    const temporary = `${this.#path}.tmp-${crypto.randomUUID()}`;
    try {
      const file = await Deno.open(temporary, { createNew: true, write: true });
      try {
        await file.write(new TextEncoder().encode(`${JSON.stringify(state, null, 2)}\n`));
        await file.sync();
      } finally {
        file.close();
      }
      await Deno.rename(temporary, this.#path);
    } finally {
      try {
        await Deno.remove(temporary);
      } catch {
        // Preserve the write or rename error; the temporary file is safe to ignore.
      }
    }
  }
}

export async function itemFingerprint(item: ContentItem): Promise<string> {
  const itemUrl = normalizedUrl(item.link);
  const sourceUrl = normalizedUrl(item.sourceUrl);
  const identity = itemUrl && itemUrl !== sourceUrl
    ? itemUrl
    : `${sourceUrl}\n${item.source.trim()}\n${item.title.trim()}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity.normalize("NFKC")),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function selectionFromVerdict(
  candidate: { item: ContentItem; fingerprint: string },
  verdict: DecisionVerdict,
  config: DecisionConfig,
): ItemSelection {
  if (verdict.confidence < config.confidenceThreshold) {
    const [confidence, threshold] = comparedConfidences(
      verdict.confidence,
      config.confidenceThreshold,
    );
    return {
      ...candidate,
      selected: true,
      kind: "review",
      reason:
        `Strands leaned ${verdict.choice} with ${confidence} confidence in its relevance classification; included conservatively and marked Review because this is below the ${threshold} decision threshold`,
      confidence: verdict.confidence,
    };
  }
  const selected = verdict.choice === "include";
  return {
    ...candidate,
    selected,
    kind: selected ? "selected" : "excluded",
    reason: `Strands chose ${verdict.choice} with ${
      formatConfidence(verdict.confidence)
    } confidence in its relevance classification`,
    confidence: verdict.confidence,
  };
}

function fallbackSelections(
  candidates: Array<{ item: ContentItem; fingerprint: string }>,
  reason: string,
): ItemSelection[] {
  return candidates.map((candidate) => ({
    ...candidate,
    selected: true,
    kind: "fallback",
    reason,
  }));
}

function resultInInputOrder(
  selections: ItemSelection[],
  fingerprints: string[],
  warning?: string,
): SelectionResult {
  const order = new Map(fingerprints.map((fingerprint, index) => [fingerprint, index]));
  selections.sort((left, right) =>
    (order.get(left.fingerprint) ?? 0) - (order.get(right.fingerprint) ?? 0)
  );
  return {
    items: selections,
    selected: selections.filter((selection) => selection.selected).map((selection) =>
      selection.item
    ),
    warning,
  };
}

function normalizedUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return value.trim();
  }
}

function parentDirectory(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "." : normalized.slice(0, index) || "/";
}

function emptyState(): SeenState {
  return { version: STATE_VERSION, seen: {} };
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatConfidence(value: number): string {
  return percentage(value, 2);
}

function comparedConfidences(value: number, threshold: number): [string, string] {
  for (let digits = 2; digits <= 15; digits++) {
    const formattedValue = percentage(value, digits);
    const formattedThreshold = percentage(threshold, digits);
    if (value === threshold || formattedValue !== formattedThreshold) {
      return [formattedValue, formattedThreshold];
    }
  }
  return [`${String(value * 100)}%`, `${String(threshold * 100)}%`];
}

function percentage(value: number, digits: number): string {
  return `${Number((value * 100).toFixed(digits))}%`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface SeenState {
  version: 1;
  seen: Record<string, string>;
}
