"""Command-line interface for distil."""

import signal
import sys
from datetime import datetime

import typer

from distil.config import get_feeds, get_llm_model, get_output_dir, load_config
from distil.core import collect_content
from distil.llm import generate_distil_batched
from distil.prompts import build_system_prompt
from distil.ollama_setup import ensure_ollama_ready


def signal_handler(sig, frame):
    """Handle keyboard interrupt gracefully."""
    print("\n👋 Interrupted by user")
    sys.exit(0)

app = typer.Typer(help="Generate weekly research distils")


@app.command()
def run(
    config: str = typer.Option("config.toml", help="Path to config file"),
    days: int = typer.Option(7, help="Days of content to include"),
):
    """Generate a distil from configured sources."""
    # Set up graceful interrupt handling
    signal.signal(signal.SIGINT, signal_handler)

    try:
        typer.echo(f"Loading config from {config}...")
        cfg = load_config(config)

        # Collect content from all feeds
        feeds = get_feeds(cfg)
        typer.echo(f"Fetching from {len(feeds)} feeds...")
        items, health_report = collect_content(feeds, days_back=days, min_items_threshold=1)

        # Check if we have enough items to proceed
        if len(items) == 0:
            typer.echo(
                "❌ No items collected from any feeds. Check feed health report above.",
                err=True,
            )
            typer.echo("Suggestion: Try increasing --days or check feed URLs.", err=True)
            raise typer.Exit(1)

        typer.echo(f"✅ Collected {len(items)} items")

        # Generate distil using batch processing
        domain = cfg.get("domain", {}).get("focus", "drug discovery")
        reading_time = cfg.get("output", {}).get("reading_time_minutes", 5)
        system_prompt = build_system_prompt(domain)
        model = get_llm_model(cfg)

        # Ensure Ollama is ready if using an ollama model
        if model.startswith("ollama/"):
            typer.echo("Checking Ollama setup...")
            if not ensure_ollama_ready(model):
                typer.echo("❌ Failed to set up Ollama. Please check the error messages above.", err=True)
                raise typer.Exit(1)

        typer.echo(f"Generating distil with {model} using batch processing...")
        try:
            distil_md = generate_distil_batched(
                system_prompt,
                items,
                model=model,
                batch_size=3,  # Process 3 items per batch for stability
                reading_time=reading_time
            )
        except Exception as e:
            typer.echo(f"Error generating distil: {e}", err=True)
            raise typer.Exit(1)

        # Save output
        output_dir = get_output_dir(cfg)
        output_dir.mkdir(parents=True, exist_ok=True)
        date_str = datetime.now().strftime("%Y-%m-%d")
        output_path = output_dir / f"distil-{date_str}.md"
        output_path.write_text(distil_md)

        typer.echo(f"✓ Saved to {output_path}")

    except KeyboardInterrupt:
        typer.echo("\n👋 Interrupted by user")
        raise typer.Exit(0)


@app.command()
def serve(
    port: int = typer.Option(5001, help="Port for web UI"),
    no_browser: bool = typer.Option(False, help="Don't open browser automatically"),
):
    """Launch the web UI."""
    # Set up graceful interrupt handling
    signal.signal(signal.SIGINT, signal_handler)

    try:
        import webbrowser

        from distil.web import start_server

        if not no_browser:
            # Open browser after brief delay (server needs to start first)
            import threading

            threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{port}")).start()

        typer.echo(f"Starting server at http://localhost:{port}")
        start_server(port=port)
    except KeyboardInterrupt:
        typer.echo("\n👋 Server stopped")
        raise typer.Exit(0)


if __name__ == "__main__":
    app()
