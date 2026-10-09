import type { ContentItem, DecisionConfig, FetchLike } from "./types.ts";

export interface DecisionVerdict {
  choice: "include" | "exclude";
  confidence: number;
}

export interface DecisionClient {
  health(signal?: AbortSignal): Promise<void>;
  decide(
    item: ContentItem,
    focus: string,
    signal?: AbortSignal,
  ): Promise<DecisionVerdict>;
}

export class StrandsDecisionClient implements DecisionClient {
  readonly #config: DecisionConfig;
  readonly #fetcher: FetchLike;

  constructor(config: DecisionConfig, fetcher: FetchLike = fetch) {
    this.#config = config;
    this.#fetcher = fetcher;
  }

  async health(signal?: AbortSignal): Promise<void> {
    const response = await this.#fetcher(`${this.#config.baseUrl}/health`, {
      redirect: "manual",
      signal: requestSignal(signal, this.#config.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Strands health check returned HTTP ${response.status}`);
    }
  }

  async decide(
    item: ContentItem,
    focus: string,
    signal?: AbortSignal,
  ): Promise<DecisionVerdict> {
    const response = await this.#fetcher(`${this.#config.baseUrl}/v1/systemone`, {
      method: "POST",
      redirect: "manual",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        state: {
          research_focus: focus,
          source: item.source,
          title: item.title,
          published: item.date,
          url: item.link,
          content: item.content.slice(0, 6_000),
        },
        questions: {
          selection: {
            type: "choice",
            instructions:
              "Based only on the supplied research focus, source metadata, title, and content, should this item be considered for the focused research digest? Do not infer missing facts or treat source claims as independently verified.",
            criteria: {
              include:
                "The supplied title or content contains concrete, substantive information materially relevant to the research focus.",
              exclude:
                "The supplied title and content are clearly off-topic, purely promotional, or too insubstantial to support a useful summary. Exclude only when the supplied evidence supports that choice.",
            },
          },
        },
      }),
      signal: requestSignal(signal, this.#config.timeoutMs),
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 500).trim();
      throw new Error(
        `Strands request returned HTTP ${response.status}${
          details ? `: ${details}` : ""
        }`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Strands returned malformed JSON");
    }
    const answer = record(record(record(payload).answers).selection);
    const choice = answer.choice;
    const confidence = answer.confidence;
    if (
      answer.type !== "choice" || (choice !== "include" && choice !== "exclude") ||
      typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 ||
      confidence > 1
    ) {
      throw new Error("Strands returned an invalid selection answer");
    }
    return { choice, confidence };
  }
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}
