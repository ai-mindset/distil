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
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) only for YouTube sources

## Quick start

With Ollama installed:

    deno task distil setup
    deno task distil run

The setup command starts the local Ollama server when needed and pulls the model from
`config.toml`. To use the local web UI instead:

    deno task distil serve

The UI listens on `http://127.0.0.1:5001`. It fetches sources, previews feed health and
matching items, streams generation progress, and stores collision-safe history files under
`history/`.

## LLM configuration

All providers share one small OpenAI-compatible transport. Distil sends
`POST /v1/chat/completions`, supports JSON and SSE responses, retries transient failures,
and applies a request timeout.

### Ollama

The checked-in configuration uses Ollama:

    [llm]
    provider = "ollama"
    model = "qwen2.5:3b"
    base_url = "http://127.0.0.1:11434/v1"
    timeout_seconds = 900
    retries = 2

Legacy model values such as `ollama/qwen2.5:3b` remain supported.

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
