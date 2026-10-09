# ⚗️ Distil

Distil collects recent RSS, Atom, and YouTube content, filters it for relevance, and
produces a concise Markdown research digest with Ollama or any OpenAI-compatible
chat-completions API, including Mistral and 9Router.

The application is written in TypeScript for Deno. It has no third-party runtime packages:
configuration, feed parsing, CLI handling, web serving, streaming, and tests all use
repository code or stable Deno APIs.

## Requirements

- [Deno 2](https://docs.deno.com/runtime/)
- [Ollama](https://ollama.com/download) for local models, or an API key for a compatible
  hosted provider
- [Strands Decider](https://github.com/strands-labs/strands-decider) only when optional
  local relevance decisions are enabled
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) only for YouTube sources

## Quick start

With Ollama installed:

    deno task distil setup
    deno task distil run

The setup command verifies configured local services. It starts Ollama and pulls its model
only when `manage_local = true`. To use the local web UI instead:

    deno task distil serve

The UI listens on `http://127.0.0.1:5001`. Fetching runs as an in-process background job:
the page reports source and Strands progress, and leaving for history then returning
resumes the same view. **Stop and reset** cancels an in-flight fetch and clears its cached
result. The UI previews feed health and explained item-selection decisions, streams
generation progress, and stores collision-safe history files under `history/`.

## LLM configuration

All providers share one small OpenAI-compatible transport. Distil sends
`POST /v1/chat/completions`, supports JSON and SSE responses, retries transient failures,
and applies a request timeout.

### Ollama

The checked-in configuration uses Ollama:

    [llm]
    provider = "ollama"
    model = "qwen3.6:27b"
    base_url = "http://127.0.0.1:11434/v1"
    manage_local = true
    timeout_seconds = 900
    retries = 2

Legacy model values such as `ollama/qwen3.6:27b` remain supported.

For Ollama running on another machine through an SSH tunnel, prevent Distil from invoking
the local `ollama` executable:

    ssh -NT -L 11434:127.0.0.1:11434 USER@OLLAMA_SERVER

    [llm]
    provider = "ollama"
    model = "qwen3.6:27b"
    base_url = "http://127.0.0.1:11434/v1"
    manage_local = false

Unmanaged endpoints are still checked for reachability and model availability. Pull a
missing model on the server rather than on the Distil machine.

### Mistral

Mistral exposes the same chat-completions request shape. Set the key in the environment
rather than in TOML:

    export MISTRAL_API_KEY="..."

Then configure:

    [llm]
    provider = "openai"
    model = "mistral-small-latest"
    base_url = "https://api.mistral.ai/v1"
    api_key_env = "MISTRAL_API_KEY"
    timeout_seconds = 120
    retries = 2

### Other OpenAI-compatible services

Set `provider = "openai"`, choose the service's model and base URL, and name the
environment variable that holds its key:

    [llm]
    provider = "openai"
    model = "your-model"
    base_url = "https://provider.example/v1"
    api_key_env = "PROVIDER_API_KEY"

For a local endpoint with no authentication, set `api_key_env = ""`.

[9Router](https://github.com/decolua/9router) is useful when routing or provider failover
is needed:

    base_url = "http://127.0.0.1:20128/v1"
    api_key_env = "NINEROUTER_KEY"

[Headroom](https://github.com/headroomlabs-ai/headroom) can be placed in front of a
compatible provider when prompt compression is worth the extra local service. Point
`base_url` at its OpenAI-compatible proxy. Distil does not require either service and does
not embed OpenHands or Diffy in its runtime.

## Local relevance decisions

Distil can ask Strands Decider whether each new item is useful for the configured research
focus before calling the generative model. Strands has a custom classification head, so it
does not run through Ollama. Run its official local server separately:

    pip install strands-decider
    strands-decider serve StrandsAgents/strands-decider-2B-hobson-v21 --port 8000

Then enable its loopback endpoint:

    [decision]
    enabled = true
    base_url = "http://127.0.0.1:8000"
    confidence_threshold = 0.9
    timeout_seconds = 10

Distil accepts an exclusion only when Strands meets the confidence threshold. The preview
labels confident inclusions as **Keep**, confident exclusions as **Skip**, previously
processed items as **Seen**, and low-confidence choices as **Review** while reporting
whether Strands leaned include or exclude. A malformed response, timeout, or unavailable
service is labelled **Fallback** and includes the item conservatively. Decision endpoints
are restricted to loopback, so source material is never sent to a hosted fallback. Strands
confidence measures its relevance classification; it does not establish the scientific
truth, quality, or reproducibility of a source's claims.

Distil does not install or start Strands. When decision selection is enabled,
`deno task distil setup` verifies that its server is healthy alongside Ollama.

Preview selection without calling the generative LLM:

    deno task distil preview --days 7

After a digest is saved, Distil records reviewed item fingerprints in
`.distil/state.json`. Later runs skip them; use `--include-seen` or the web checkbox to
reconsider them. Previewing never marks an item as seen.

CLI `run` and `preview` report progress as each source completes and as Strands evaluates
each new item. Press `Ctrl+C` to stop a CLI process.

## Sources and filtering

Each `[[feeds]]` entry accepts:

| Field       | Meaning                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| `url`       | Required HTTP(S) RSS, Atom, YouTube video, channel, or playlist URL      |
| `name`      | Display name; defaults to the URL hostname                               |
| `type`      | Optional `rss` or `youtube`; YouTube URLs are detected automatically     |
| `max_items` | Maximum matching items or transcripts                                    |
| `keywords`  | Include an item when any keyword occurs in its title or summary          |
| `pattern`   | Additional case-insensitive JavaScript regex; leading `(?i)` is accepted |

YouTube captions are downloaded into the ignored `transcripts/` directory. Source text is
treated as untrusted data in prompts.

## Commands

    deno task distil run --days 3
    deno task distil run --include-seen
    deno task distil preview --days 7
    deno task distil run --config custom.toml
    deno task distil serve --host 127.0.0.1 --port 5001 --no-browser
    deno task distil setup
    deno task distil --help

CLI digests use `[output].directory`; web history uses `history/`. Both use timestamped,
collision-safe filenames and never silently replace an existing digest.

To install a global source command:

    deno install --global --name distil --allow-read --allow-write --allow-net --allow-env --allow-run src/main.ts

To build a bundled, minified, self-contained QuickJS executable for the current operating
system and architecture:

    deno task compile

The output is `distil-bin`. Native executables are target-specific, so a cross-platform
release consists of one single-file build per supported Deno `--target`, rather than one
binary that runs on every operating system. Deno currently labels QuickJS and bundled
compilation experimental; smoke-test each release artifact on its target platform.

## Development

    deno task check

The check task formats, lints, type-checks, and runs the full deterministic test suite.
Tests mock network, LLM, and Ollama boundaries; they do not spend API credits or download
models.

The web server binds to loopback by default and has no authentication. Do not expose it
publicly without adding an authentication and authorization design.
