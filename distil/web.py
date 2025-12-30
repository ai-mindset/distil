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

/* Minimal theme toggle button */
.theme-toggle {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
    background: rgba(0,0,0,0.05);
    color: #6b7280;
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    width: 40px;
    height: 40px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
}

.theme-toggle:hover {
    background: rgba(0,0,0,0.08);
    border-color: rgba(0,0,0,0.15);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

[data-theme="dark"] .theme-toggle {
    background: rgba(255,255,255,0.05);
    color: #9ca3af;
    border-color: rgba(255,255,255,0.1);
}

[data-theme="dark"] .theme-toggle:hover {
    background: rgba(255,255,255,0.08);
    border-color: rgba(255,255,255,0.15);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

/* Minimal, fresh button styling */
#fetch-btn, #generate-btn {
    width: auto !important;
    min-width: 140px;
    max-width: 200px;
    padding: 0.75rem 1.5rem;
    font-size: 0.95rem;
    font-weight: 500;
    border-radius: 8px;
    transition: all 0.2s ease;
    border: 1px solid rgba(0,0,0,0.1);
    background: #ffffff;
    color: #374151;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

/* Dark mode buttons */
[data-theme="dark"] #fetch-btn,
[data-theme="dark"] #generate-btn {
    background: #1f2937;
    color: #d1d5db;
    border-color: rgba(255,255,255,0.1);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

/* Enhanced button accessibility */
#fetch-btn:focus, #generate-btn:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

#fetch-btn:hover, #generate-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    border-color: rgba(0,0,0,0.2);
    background: #f9fafb;
}

[data-theme="dark"] #fetch-btn:hover,
[data-theme="dark"] #generate-btn:hover {
    background: #374151;
    border-color: rgba(255,255,255,0.2);
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

/* Active state */
#fetch-btn:active, #generate-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

/* Ensure buttons don't span full width in forms */
form button, form .btn {
    width: auto !important;
}

/* Constrain input field widths */
input[type="number"], input[type="text"] {
    max-width: 200px;
    width: auto !important;
}

/* Accessibility improvements */
* {
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
    line-height: 1.6;
    font-size: 16px;
}

/* High contrast focus indicators */
button:focus, input:focus, a:focus {
    outline: 2px solid #fbbf24;
    outline-offset: 2px;
}

/* Improved link contrast */
a {
    color: #2563eb;
    text-decoration: underline;
}

[data-theme="dark"] a {
    color: #60a5fa;
}

/* Screen reader only text */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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
    margin: 1.5rem 0;
    border-radius: 0.5rem;
    font-family: monospace;
    white-space: pre-wrap;
    max-height: 500px;
    overflow-y: auto;
    position: relative;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    clear: both;
    text-align: center; /* Center content within container */
}

[data-theme="dark"] .streaming-output {
    background: #1e293b;
    border-left-color: #60a5fa;
    color: #e2e8f0;
}

/* Live progress indicator (fixed positioning for notifications) */
.progress-indicator-fixed {
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

/* Progress banner for streaming (small, compact) */
.progress-indicator {
    background: #f8fafc;
    color: #475569;
    border: 1px solid #e2e8f0;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    text-align: center;
    display: inline-block;
    margin: 0.5rem 0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    position: relative;
    z-index: 10;
}

[data-theme="dark"] .progress-indicator {
    background: #1e293b;
    color: #cbd5e1;
    border-color: #334155;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
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
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        console.log('Applied saved theme:', savedTheme);
    })();

    // Load saved theme and update UI
    document.addEventListener('DOMContentLoaded', function() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
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

    // HTMX loading states integration
    document.addEventListener('DOMContentLoaded', function() {
        // Setup HTMX event listeners for automatic loading states (fetch button only)
        document.body.addEventListener('htmx:beforeRequest', function(event) {
            const trigger = event.detail.elt;
            if (trigger && trigger.id === 'fetch-btn') {
                showLoading(trigger.id, 'Fetching feeds...');
            }
        });

        document.body.addEventListener('htmx:afterRequest', function(event) {
            const trigger = event.detail.elt;
            if (trigger && trigger.id === 'fetch-btn') {
                hideLoading(trigger.id);
            }
        });

        // Handle errors to make sure loading state is cleared (fetch button only)
        document.body.addEventListener('htmx:responseError', function(event) {
            const trigger = event.detail.elt;
            if (trigger && trigger.id === 'fetch-btn') {
                hideLoading(trigger.id);
            }
        });

        document.body.addEventListener('htmx:sendError', function(event) {
            const trigger = event.detail.elt;
            if (trigger && trigger.id === 'fetch-btn') {
                hideLoading(trigger.id);
            }
        });
    });

    // Streaming progress handling
    function startStreamingGenerate() {
        const generateBtn = document.getElementById('generate-btn');
        const resultDiv = document.getElementById('result');

        // Show initial loading state
        showLoading('generate-btn', 'Starting generation...');

        // Clear previous results and set up progress display
        resultDiv.innerHTML = `
            <div style="text-align: center; margin: 1rem 0;">
                <div class="progress-indicator">
                    🔄 Generating distil...
                </div>
            </div>
            <div class="streaming-output" style="display: none;">
                <pre id="progress-text" class="whitespace-pre-wrap"></pre>
            </div>
        `;

        // Start Server-Sent Events connection
        const eventSource = new EventSource('/generate-streaming');
        const progressText = document.getElementById('progress-text');

        let firstContentReceived = false;
        eventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'progress') {
                    // Show streaming output container and hide progress indicator on first content
                    if (!firstContentReceived) {
                        document.querySelector('.progress-indicator').parentElement.style.display = 'none';
                        document.querySelector('.streaming-output').style.display = 'block';
                        document.querySelector('.streaming-output').style.textAlign = 'left';
                        firstContentReceived = true;
                    }

                    // Append progress update
                    progressText.textContent += data.content;
                    // Auto-scroll to bottom
                    progressText.scrollTop = progressText.scrollHeight;

                } else if (data.type === 'complete') {
                    // Generation completed
                    eventSource.close();
                    hideLoading('generate-btn');

                    // Add completion message
                    progressText.textContent += `\n\n✅ Saved to ${data.file}`;

                } else if (data.type === 'error') {
                    // Handle errors
                    eventSource.close();
                    hideLoading('generate-btn');

                    // Show error in progress indicator if content hasn't started yet
                    if (!firstContentReceived) {
                        const indicator = document.querySelector('.progress-indicator');
                        if (indicator) {
                            indicator.innerHTML = '❌ Generation failed';
                        }
                    } else {
                        progressText.textContent += `\n\n❌ Error: ${data.message}`;
                    }
                }
            } catch (e) {
                console.error('Error parsing SSE data:', e);
            }
        };

        eventSource.onerror = function(event) {
            console.error('SSE connection error:', event);
            eventSource.close();
            hideLoading('generate-btn');

            const indicator = document.querySelector('.progress-indicator');
            if (indicator) {
                indicator.innerHTML = '❌ Connection error';
            }
        };

        // Return eventSource so it can be closed if needed
        return eventSource;
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
        "🌙", cls="theme-toggle", onclick="toggleTheme()",
        title="Toggle dark/light mode",
        aria_label="Toggle between dark and light theme",
        role="switch", aria_checked="false"
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
                LabelInput("Days back", type="number", name="days", value="7",
                          min="1", max="30", aria_describedby="days-help"),
                Div("Number of days to look back for content (1-30)",
                   id="days-help", cls="text-sm text-gray-600 mb-2"),
                Button("Fetch Items", type="submit", id="fetch-btn", cls=ButtonT.primary,
                       hx_post="/fetch", hx_target="#preview", hx_include="closest form",
                       aria_describedby="fetch-help"),
                Div("Fetches content from configured RSS feeds",
                   id="fetch-help", cls="sr-only"),
            ),
            role="form", aria_label="Content fetching form"
        ),
        Div(id="preview", role="region", aria_live="polite", aria_label="Fetched content preview"),
        Div(id="result", role="region", aria_live="polite", aria_label="Generation results"),
        A("View History →", href="/history", cls="block mt-4",
          aria_label="View previously generated distils"),
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
        Button(
            "Generate Distil",
            id="generate-btn",
            cls=ButtonT.primary,
            onclick="startStreamingGenerate()",
            aria_describedby="generate-help",
            aria_label="Generate distil summary from fetched items"
        ),
        Div("Processes fetched content into a summarized distil using AI",
           id="generate-help", cls="sr-only"),
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


@rt("/generate-streaming")
async def generate_streaming():
    """Generate distil with real-time streaming progress."""
    from fasthtml.common import StreamingResponse
    from distil.llm import generate_distil_batched_streaming
    from distil.prompts import build_system_prompt
    from distil.config import load_config, get_llm_model
    from datetime import datetime
    import asyncio
    import json

    global _cached_items

    if not _cached_items:
        # Return error as SSE
        def error_stream():
            data = {"type": "error", "message": "No items fetched. Please fetch first."}
            yield f"data: {json.dumps(data)}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    cfg = load_config()
    domain = cfg.get("domain", {}).get("focus", "drug discovery")
    reading_time = cfg.get("output", {}).get("reading_time_minutes", 5)
    system_prompt = build_system_prompt(domain)
    model = get_llm_model(cfg)

    async def progress_stream():
        """Stream progress updates as Server-Sent Events."""
        try:
            full_content = ""

            # Stream progress from the existing streaming function
            # Note: generate_distil_batched_streaming is a generator, so we iterate normally
            for chunk in generate_distil_batched_streaming(
                system_prompt,
                _cached_items,
                model=model,
                batch_size=3,
                reading_time=reading_time,
            ):
                # Send progress update with proper JSON encoding
                data = {"type": "progress", "content": chunk}
                yield f"data: {json.dumps(data)}\n\n"
                full_content += chunk

                # Small delay to allow frontend to process and prevent blocking
                await asyncio.sleep(0.01)

            # Save to history
            history_dir = Path("history")
            history_dir.mkdir(exist_ok=True)
            date_str = datetime.now().strftime("%Y-%m-%d_%H%M")
            output_path = history_dir / f"distil-{date_str}.md"
            output_path.write_text(full_content)

            # Send completion with proper JSON encoding
            data = {"type": "complete", "file": output_path.name, "content": full_content}
            yield f"data: {json.dumps(data)}\n\n"

        except Exception as e:
            # Send error with proper JSON encoding
            data = {"type": "error", "message": str(e)}
            yield f"data: {json.dumps(data)}\n\n"

    return StreamingResponse(progress_stream(), media_type="text/event-stream")


def start_server(port: int = 5001):
    """Start the FastHTML server."""
    import socket
    import sys
    import uvicorn

    def is_port_available(port: int, host: str = "0.0.0.0") -> bool:
        """Check if a port is available for binding."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((host, port))
                return True
            except OSError:
                return False

    def find_available_port(start_port: int, max_attempts: int = 10) -> int:
        """Find an available port starting from start_port."""
        for attempt in range(max_attempts):
            candidate_port = start_port + attempt
            if is_port_available(candidate_port):
                return candidate_port
        return None

    def kill_process_on_port(target_port):
        """Kill the specific process using the target port (avoiding self-termination)."""
        import subprocess
        import platform
        import os

        current_pid = os.getpid()

        try:
            system = platform.system().lower()

            if system == 'windows':
                # Use netstat to find the process using the port on Windows
                result = subprocess.run(['netstat', '-ano'], capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    for line in result.stdout.split('\n'):
                        if f':{target_port}' in line and 'LISTENING' in line:
                            parts = line.split()
                            if len(parts) > 4:
                                pid = parts[-1]
                                if pid.isdigit() and int(pid) != current_pid:
                                    subprocess.run(['taskkill', '/F', '/PID', pid],
                                                 capture_output=True, timeout=5)
                                    return True
            else:
                # Use lsof to find the process using the port on Unix/Linux/macOS
                result = subprocess.run(['lsof', '-ti', f':{target_port}'],
                                      capture_output=True, text=True, timeout=10)
                if result.returncode == 0 and result.stdout.strip():
                    pids = result.stdout.strip().split('\n')
                    for pid in pids:
                        if pid.isdigit() and int(pid) != current_pid:
                            # Kill the specific process
                            subprocess.run(['kill', '-9', pid], capture_output=True, timeout=5)
                            return True
            return False
        except Exception:
            return False

    # Check if the requested port is available
    if not is_port_available(port):
        print(f"🔍 Port {port} is busy, attempting automatic cleanup...")

        # Try to kill the specific process using this port
        if kill_process_on_port(port):
            import time
            time.sleep(2)  # Wait for processes to fully terminate

            if is_port_available(port):
                print(f"✅ Cleared previous distil processes, port {port} is now available")
            else:
                print(f"⚠️  Port {port} still busy, finding alternative...")
                alternative_port = find_available_port(port + 1)
                if alternative_port:
                    port = alternative_port
                    print(f"🚀 Using port {port} instead")
                else:
                    print(f"❌ No available ports found. Try restarting your computer.")
                    sys.exit(1)
        else:
            print(f"⚠️  Cleanup failed, finding alternative port...")
            alternative_port = find_available_port(port + 1)
            if alternative_port:
                port = alternative_port
                print(f"🚀 Using port {port} instead")
            else:
                print(f"❌ Port {port} is busy and no alternatives found")
                print(f"💡 Try: sudo lsof -ti:{port} | xargs kill -9  # or restart your computer")
                sys.exit(1)

    try:
        print(f"🚀 Starting server on http://localhost:{port}")
        uvicorn.run("distil.web:app", host="0.0.0.0", port=port, reload=False)
    except OSError as e:
        if "Address already in use" in str(e) or "Only one usage of each socket address" in str(e):
            print(f"❌ Port {port} became unavailable during startup")
            alternative_port = find_available_port(port + 1)
            if alternative_port:
                print(f"💡 Try: distil serve --port {alternative_port}")
            else:
                print(f"💡 Try restarting or use: distil serve --port {port + 100}")
        else:
            print(f"❌ Server startup error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n👋 Server stopped")
        sys.exit(0)
