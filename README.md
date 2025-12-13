# ⚗️ Distil

Weekly distil generator for drug discovery and AI research. Aggregates content from RSS feeds and YouTube transcripts, filters by relevance, and generates executive summaries using local or cloud LLMs.

## Quick Start

**Install dependencies:**
```bash
# Install uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Ollama (local LLM server)
curl -fsSL https://ollama.com/install.sh | sh

# Pull Mistral model
ollama pull mistral:latest
```

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Ollama](https://ollama.ai/) with Mistral model (for local LLM)

## Installation

**From source (development):**
```bash
git clone https://github.com/ai-mindset/distil.git
cd distil
uv tool install --editable .
```

**From package (when published):**
```bash
uv tool install distil
```

## Configuration

Copy `config.toml` to your working directory and edit:

```toml
[llm]
model = "ollama/mistral:latest"  # Local (free) — or "anthropic/claude-sonnet-4-20250514" (requires API key)

[domain]
focus = "drug discovery, pharmacology, AI/ML for therapeutics"

[[feeds]]
url = "https://rss.arxiv.org/rss/cs.ai"
keywords = ["drug", "molecule", "protein", "binding"]  # Only items matching these
max_items = 20
```

For cloud LLMs, set your API key:
```bash
export ANTHROPIC_API_KEY="sk-..."
```

## Usage

**Web UI (recommended):**
```bash
distil serve
```
Opens browser at `http://localhost:5001`. Click "Fetch Items" to preview, then "Generate Distil".

**CLI:**
```bash
distil run              # Generate distil with defaults
distil run --days 3     # Last 3 days only
```

## Output

Distils are saved to `history/distil-YYYY-MM-DD_HHMM.md` in your current directory. View past distils at `http://localhost:5001/history`.

## Adding Sources

Edit `config.toml` to add feeds:

```toml
[[feeds]]
url = "https://example.com/rss"
name = "My Feed"
keywords = ["relevant", "terms"]  # Optional: filter by keywords
max_items = 25                     # Optional: limit items
```

## Features

- **🌙 Dark Mode**: Toggle between light/dark themes in the web UI
- **📊 Feed Health Monitoring**: Real-time status of each RSS feed
- **🔄 Batch Processing**: Handles large content volumes without timeout
- **📈 Streaming Progress**: Live updates during distil generation
- **📁 History Management**: View and manage past distils

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Connection refused" from Ollama | Run `ollama serve` in another terminal |
| Slow generation | Reduce `max_items` per feed, or use fewer feeds |
| Missing items | Check `keywords` aren't too restrictive |
| Web app stuck at "Fetching..." | Check feed URLs are accessible; see feed health report |
| Timeout errors | System now uses batch processing to prevent this |
