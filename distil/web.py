"""FastHTML web interface for distil."""

from datetime import datetime
from pathlib import Path

from fasthtml.common import (
    H3,
    H4,
    A,
    Button,
    Card,
    Details,
    Div,
    Form,
    Li,
    P,
    Pre,
    Script,
    Style,
    Summary,
    Titled,
    Ul,
    fast_app,
)
from monsterui.all import ButtonT, LabelInput, Theme
from starlette.concurrency import run_in_threadpool

from distil.config import get_feeds, get_llm_model, load_config
from distil.core import collect_content
from distil.llm import (
    generate_distil_batched,
)
from distil.prompts import build_system_prompt

# Custom CSS for dark mode and better UX
custom_css = """
/* Dark mode support */
:root {
    --bg-light: #ffffff;
    --bg-dark: #111827;
    --text-light: #1f2937;
    --text-dark: #f9fafb;
    --card-light: #ffffff;
    --card-dark: #1f2937;
    --border-light: #d1d5db;
    --border-dark: #374151;
    --input-light: #ffffff;
    --input-dark: #374151;
    --button-primary-dark: #3b82f6;
    --button-hover-dark: #2563eb;
    --link-dark: #60a5fa;
}

/* Base theme styles */
html[data-theme="light"] {
    background-color: var(--bg-light) !important;
    color: var(--text-light) !important;
}

html[data-theme="dark"] {
    background-color: var(--bg-dark) !important;
    color: var(--text-dark) !important;
}

/* Body and main containers */
html[data-theme="dark"] body {
    background-color: var(--bg-dark) !important;
    color: var(--text-dark) !important;
}

html[data-theme="dark"] main {
    background-color: var(--bg-dark) !important;
    color: var(--text-dark) !important;
}

/* Cards and containers */
html[data-theme="dark"] .card,
html[data-theme="dark"] [class*="card"] {
    background-color: var(--card-dark) !important;
    border-color: var(--border-dark) !important;
    color: var(--text-dark) !important;
}

/* Inputs and form elements */
html[data-theme="dark"] input,
html[data-theme="dark"] input[type="text"],
html[data-theme="dark"] input[type="number"],
html[data-theme="dark"] textarea,
html[data-theme="dark"] select {
    background-color: var(--input-dark) !important;
    color: var(--text-dark) !important;
    border-color: var(--border-dark) !important;
}

html[data-theme="dark"] input::placeholder,
html[data-theme="dark"] textarea::placeholder {
    color: #9ca3af !important;
}

/* Labels and text */
html[data-theme="dark"] label {
    color: var(--text-dark) !important;
}

html[data-theme="dark"] h1,
html[data-theme="dark"] h2,
html[data-theme="dark"] h3,
html[data-theme="dark"] h4,
html[data-theme="dark"] h5,
html[data-theme="dark"] h6 {
    color: var(--text-dark) !important;
}

html[data-theme="dark"] p {
    color: var(--text-dark) !important;
}

/* Buttons */
html[data-theme="dark"] button:not(.theme-toggle) {
    background-color: var(--button-primary-dark) !important;
    color: white !important;
    border-color: var(--button-primary-dark) !important;
}

html[data-theme="dark"] button:not(.theme-toggle):hover {
    background-color: var(--button-hover-dark) !important;
}

/* Links */
html[data-theme="dark"] a {
    color: var(--link-dark) !important;
}

html[data-theme="dark"] a:hover {
    color: #93c5fd !important;
}

/* Code and pre elements */
html[data-theme="dark"] pre,
html[data-theme="dark"] code {
    background-color: #0f172a !important;
    color: #e2e8f0 !important;
    border-color: var(--border-dark) !important;
}

/* Lists */
html[data-theme="dark"] ul,
html[data-theme="dark"] ol,
html[data-theme="dark"] li {
    color: var(--text-dark) !important;
}

/* Details and summary */
html[data-theme="dark"] details,
html[data-theme="dark"] summary {
    color: var(--text-dark) !important;
}

/* Dividers */
html[data-theme="dark"] hr {
    border-color: var(--border-dark) !important;
}

/* Specific MonsterUI component overrides */
html[data-theme="dark"] .monster-card,
html[data-theme="dark"] .monster-button,
html[data-theme="dark"] .monster-input {
    background-color: var(--card-dark) !important;
    color: var(--text-dark) !important;
    border-color: var(--border-dark) !important;
}

/* Override any existing light styles */
html[data-theme="dark"] * {
    border-color: var(--border-dark) !important;
}

html[data-theme="dark"] *:not(button):not(input):not(pre):not(code) {
    background-color: transparent;
    color: inherit;
}

/* Special overrides for common framework classes */
html[data-theme="dark"] .bg-white {
    background-color: var(--card-dark) !important;
}

html[data-theme="dark"] .text-black,
html[data-theme="dark"] .text-gray-900 {
    color: var(--text-dark) !important;
}

html[data-theme="dark"] .border-gray-200,
html[data-theme="dark"] .border-gray-300 {
    border-color: var(--border-dark) !important;
}

/* Theme toggle button */
.theme-toggle {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.theme-toggle:hover {
    background: #5855eb;
    transform: scale(1.1);
}

/* Loading indicators */
.loading-text {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
}

.spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* Streaming output */
.streaming-output {
    background: #f1f5f9;
    border-left: 4px solid #3b82f6;
    padding: 1rem;
    margin: 1rem 0;
    border-radius: 0.5rem;
    font-family: monospace;
    white-space: pre-wrap;
    max-height: 500px;
    overflow-y: auto;
    position: relative;
}

[data-theme="dark"] .streaming-output {
    background: #1e293b;
    border-left-color: #60a5fa;
    color: #e2e8f0;
}

/* Live progress indicator */
.progress-indicator {
    position: fixed;
    top: 60px;
    right: 1rem;
    background: #3b82f6;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-family: monospace;
    font-size: 0.875rem;
    z-index: 999;
    min-width: 200px;
    text-align: center;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

[data-theme="dark"] .progress-indicator {
    background: #1e293b;
    border: 1px solid #374151;
}

.progress-indicator.pulsing {
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

/* Streaming status indicators */
.status-connecting { color: #f59e0b; }
.status-streaming { color: #10b981; }
.status-completed { color: #6366f1; }
.status-error { color: #ef4444; }

/* Progress indicator */
.progress-bar {
    width: 100%;
    height: 4px;
    background-color: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
    margin: 1rem 0;
}

[data-theme="dark"] .progress-bar {
    background-color: #374151;
}

.progress-fill {
    height: 100%;
    background-color: #3b82f6;
    transition: width 0.3s ease;
}
"""

app, rt = fast_app(
    hdrs=(
        Script("""
    // Theme management
    function toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        // Apply theme immediately
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        // Force a repaint to ensure styles are applied
        html.style.display = 'none';
        html.offsetHeight; // trigger a reflow
        html.style.display = '';

        // Update theme toggle icon
        updateThemeIcon(newTheme);

        console.log('Theme changed to:', newTheme);
    }

    function updateThemeIcon(theme) {
        const icon = document.querySelector('.theme-toggle');
        if (icon) {
            icon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }

    // Apply theme immediately (before DOMContentLoaded)
    (function() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        console.log('Applied saved theme:', savedTheme);
    })();

    // Load saved theme and update UI
    document.addEventListener('DOMContentLoaded', function() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
        console.log('DOM loaded, theme applied:', savedTheme);
    });

    // Custom loading indicators
    function showLoading(buttonId, text) {
        const button = document.getElementById(buttonId);
        if (button) {
            const originalText = button.textContent;
            button.dataset.originalText = originalText;
            button.innerHTML = ('<span class="loading-text">' +
                                '<span class="spinner"></span>' + text + '</span>');
            button.disabled = true;
        }
    }

    function hideLoading(buttonId) {
        const button = document.getElementById(buttonId);
        if (button && button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            button.disabled = false;
        }
    }
    """),
        Style(custom_css),
        *Theme.blue.headers(),
    )
)

# In-memory cache for fetched items between fetch and generate
_cached_items = []


def ThemeToggle():
    """Theme toggle button."""
    return Button(
        "🌙", cls="theme-toggle", onclick="toggleTheme()", title="Toggle dark/light mode"
    )


@rt("/")
def home_get():
    """Render the home page."""
    return Titled(
        "Distil",
        ThemeToggle(),
        Card(
            H3("Generate Weekly Distil"),
            Form(
                LabelInput("Days back", type="number", name="days", value="7"),
                Button("Fetch Items", type="submit", id="fetch-btn", cls=ButtonT.primary),
                hx_post="/fetch",
                hx_target="#preview",
            ),
        ),
        Div(id="preview"),
        Div(id="result"),
        A("View History →", href="/history", cls="block mt-4"),
    )


@rt("/fetch")
async def fetch_post(days: int = 7):
    """Fetch content from feeds."""
    print(">>> Starting fetch", flush=True)
    global _cached_items

    cfg = await run_in_threadpool(load_config)
    print(">>> Config loaded", flush=True)
    feeds = get_feeds(cfg)
    print(f">>> Fetching from {len(feeds)} feeds", flush=True)

    _cached_items, health_report = await run_in_threadpool(
        collect_content, feeds, days_back=days, feed_timeout=15, verbose=False
    )
    print(f">>> Fetched {len(_cached_items)} items", flush=True)

    # Group by source for display
    items_by_source = {}
    for item in _cached_items:
        source = item.get("source", "unknown")
        items_by_source.setdefault(source, []).append(item)
    print(">>> Grouped items by source", flush=True)

    preview_sections = []

    # Add feed health summary
    health_summary = []
    for feed_name, status in health_report.items():
        status_icon = {
            "success": "✅",
            "warning": "⚠️",
            "empty": "📭",
            "timeout": "⏰",
            "error": "❌",
        }.get(status["status"], "❓")
        print(f">>> Feed {feed_name}: {status_icon} {status}", flush=True)

        health_summary.append(
            Li(
                f"{status_icon} {feed_name}: "
                f"{status['filtered_entries']}/{status['total_entries']} items "
                f"({status['fetch_time']:.1f}s)"
            )
        )

    if health_summary:
        preview_sections.append(
            Details(Summary("📊 Feed Health Report"), Ul(*health_summary))
        )

    # Add content sections
    for source, items in items_by_source.items():
        preview_sections.append(
            Details(
                Summary(f"{source} ({len(items)} items)"),
                Ul(*[Li(A(i["title"], href=i["link"], target="_blank")) for i in items]),
            )
        )
        print(
            f">>> Added preview for source {source} with {len(items)} items", flush=True
        )

    return Card(
        H4(f"✓ Fetched {len(_cached_items)} items"),
        *preview_sections,
        Form(
            Button(
                "Generate Distil", type="submit", id="generate-btn", cls=ButtonT.primary
            ),
            hx_post="/generate",
            hx_target="#result",
            hx_disabled_elt="this",
        ),
    )


@rt("/generate")
def generate_post():
    """Generate distil from cached items (non-streaming version)."""
    global _cached_items

    if not _cached_items:
        return Card(P("No items fetched. Please fetch first.", cls="text-red-500"))

    cfg = load_config()
    domain = cfg.get("domain", {}).get("focus", "drug discovery")
    reading_time = cfg.get("output", {}).get("reading_time_minutes", 5)

    system_prompt = build_system_prompt(domain)
    model = get_llm_model(cfg)

    # Use batch processing to avoid context limits
    try:
        distil_md = generate_distil_batched(
            system_prompt,
            _cached_items,
            model=model,
            batch_size=3,
            reading_time=reading_time,
            domain=domain,
        )

    except Exception as e:
        print(f"Error during distil generation: {e}")
        return Card(P(f"Error generating distil: {str(e)}", cls="text-red-500"))

    # Save to history directory
    history_dir = Path("history")
    history_dir.mkdir(exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d_%H%M")
    output_path = history_dir / f"distil-{date_str}.md"
    output_path.write_text(distil_md)

    return Card(
        H4(f"✓ Saved to {output_path}"),
        Pre(distil_md, cls="overflow-auto max-h-96 whitespace-pre-wrap"),
        A("View in History →", href="/history"),
    )


@rt("/history")
def history_list_get():
    """List all saved distils."""
    history_dir = Path("history")
    history_dir.mkdir(exist_ok=True)

    files = sorted(history_dir.glob("*.md"), reverse=True)

    if not files:
        return Titled("History", P("No distils yet."))

    return Titled(
        "History",
        Ul(*[Li(A(f.name, href=f"/history/{f.name}")) for f in files]),
        A("← Back", href="/"),
    )


@rt("/history/{filename}")
def history_view_get(filename: str):
    """View a specific distil."""
    filepath = Path("history") / filename

    if not filepath.exists():
        return Titled("Not Found", P(f"Distil {filename} not found."))

    content = filepath.read_text()

    return Titled(
        filename,
        Pre(content, cls="overflow-auto whitespace-pre-wrap"),
        A("← Back to History", href="/history"),
    )


def start_server(port: int = 5001):
    """Start the FastHTML server."""
    import uvicorn

    uvicorn.run("distil.web:app", host="0.0.0.0", port=port, reload=True)
