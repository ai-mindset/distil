"""Core content fetching, filtering, and processing logic."""

import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

import feedparser
import webvtt


def fetch_rss(
    url: str,
    days_back: int = 7,
    max_items: int | None = None,
    keywords: list[str] | None = None,
    timeout: int = 30,
    verbose: bool = True,
) -> tuple[list[dict], dict[str, str]]:
    """Fetch RSS feed entries with timeout and validation.

    Args:
        url: RSS feed URL.
        days_back: Only include entries from the last N days.
        max_items: Maximum number of items to return.
        keywords: If provided, only include items where title or summary
            contains at least one keyword (case-insensitive).
        timeout: Timeout for RSS feed fetching in seconds.
        verbose: Whether to print status messages.

    Returns:
        Tuple of (entry list, status dict with 'status', 'message', 'total_entries').
    """
    status = {"status": "success", "message": "", "total_entries": 0}

    if verbose:
        print(f"Fetching: {url}")

    start_time = time.time()

    try:
        # Parse feed with basic timeout handling
        feed = feedparser.parse(url)
        fetch_time = time.time() - start_time

        # Check for feed parsing errors
        if hasattr(feed, 'bozo') and feed.bozo:
            status["status"] = "warning"
            status["message"] = f"Feed parsing issues: {feed.get('bozo_exception', 'Unknown')}"
            if verbose:
                print(f"  ⚠️  Warning: {status['message']}")

        # Check if feed has entries
        if not hasattr(feed, 'entries') or len(feed.entries) == 0:
            status["status"] = "empty"
            status["message"] = f"No entries found in feed (took {fetch_time:.2f}s)"
            if verbose:
                print(f"  → 0 items ({status['message']})")
            return [], status

        status["total_entries"] = len(feed.entries)

        if verbose:
            print(f"  Found {len(feed.entries)} total entries in {fetch_time:.2f}s")

        # Check for timeout
        if fetch_time > timeout:
            status["status"] = "timeout"
            status["message"] = f"Feed fetch took {fetch_time:.2f}s (timeout: {timeout}s)"
            if verbose:
                print(f"  ⚠️  {status['message']}")

    except Exception as e:
        status["status"] = "error"
        status["message"] = f"Failed to fetch feed: {str(e)}"
        if verbose:
            print(f"  ❌ {status['message']}")
        return [], status

    cutoff = datetime.now() - timedelta(days=days_back)

    recent_entries = []
    for entry in feed.entries:
        # Parse publication date
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            pub_date = datetime(*entry.published_parsed[:6])
        elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
            pub_date = datetime(*entry.updated_parsed[:6])
        else:
            pub_date = datetime.now()

        if pub_date < cutoff:
            continue

        title = entry.title
        summary = entry.get("summary", "")

        # Keyword filtering
        if keywords:
            text = (title + " " + summary).lower()
            if not any(kw.lower() in text for kw in keywords):
                continue

        recent_entries.append(
            {
                "title": title,
                "link": entry.link,
                "published": pub_date,
                "summary": summary,
            }
        )

        if max_items and len(recent_entries) >= max_items:
            break

    # Update final status
    if verbose:
        if recent_entries:
            print(f"  → {len(recent_entries)} items (after date/keyword filtering)")
        else:
            status["message"] = f"No items matched filters (found {status['total_entries']} total)"
            print(f"  → 0 items (no items matched date/keyword filters)")

    return recent_entries, status


def parse_vtt(filepath: str) -> str:
    """Parse VTT subtitle file into plain text.

    Args:
        filepath: Path to the .vtt file.

    Returns:
        Concatenated text from all captions.
    """
    captions = webvtt.read(filepath)
    return " ".join(caption.text for caption in captions)


def fetch_youtube_transcript(
    url: str,
    output_dir: str = "transcripts",
    verbose: bool = True,
) -> str | None:
    """Fetch transcript from YouTube video using yt-dlp.

    Args:
        url: YouTube video or playlist URL.
        output_dir: Directory to save transcript files.
        verbose: If True, print progress to stdout.

    Returns:
        Path to output directory, or None on failure.
    """
    Path(output_dir).mkdir(exist_ok=True)

    if verbose:
        print(f"Fetching transcript from: {url}\n")

    cmd = [
        "yt-dlp",
        "--write-subs",
        "--no-overwrites",
        "--write-auto-sub",
        "--skip-download",
        "--sub-format",
        "vtt",
        "--output",
        f"{output_dir}/%(title)s.%(ext)s",
        "--no-warnings",
        "--ignore-errors",
        url,
    ]

    process = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )

    if verbose:
        for line in process.stdout:
            print(line.strip())

    process.wait()

    if verbose:
        print("\n✓ Done")

    return output_dir if process.returncode == 0 else None


def collect_content(
    rss_feeds: list[dict],
    youtube_urls: list[str] | None = None,
    days_back: int = 7,
    transcript_dir: str = "transcripts",
    feed_timeout: int = 30,
    min_items_threshold: int = 0,
    verbose: bool = True,
) -> tuple[list[dict], dict[str, dict]]:
    """Collect content from all configured sources with comprehensive error handling.

    Args:
        rss_feeds: List of feed configs, each with 'url' and optional 'keywords'.
        youtube_urls: List of YouTube URLs to fetch transcripts from.
        days_back: Only include content from the last N days.
        transcript_dir: Directory for storing YouTube transcripts.
        feed_timeout: Timeout per feed in seconds.
        min_items_threshold: Minimum items required across all feeds.
        verbose: Whether to print detailed status messages.

    Returns:
        Tuple of (content items list, feed health report dict).
    """
    collected = []
    feed_health_report = {}

    if verbose:
        print(f"🔍 Collecting content from {len(rss_feeds)} RSS feeds...")
        print(f"📅 Looking back {days_back} days, timeout {feed_timeout}s per feed\n")

    # Fetch RSS feeds
    for i, feed_config in enumerate(rss_feeds, 1):
        url = feed_config["url"]
        name = feed_config.get("name", f"Feed {i}")
        keywords = feed_config.get("keywords")
        max_items = feed_config.get("max_items")

        start_time = time.time()

        try:
            entries, status = fetch_rss(
                url,
                days_back=days_back,
                keywords=keywords,
                max_items=max_items,
                timeout=feed_timeout,
                verbose=verbose
            )

            # Store comprehensive health info
            feed_health_report[name] = {
                "url": url,
                "status": status["status"],
                "message": status["message"],
                "total_entries": status["total_entries"],
                "filtered_entries": len(entries),
                "fetch_time": time.time() - start_time,
                "keywords": keywords,
                "max_items": max_items
            }

            # Add successful entries to collection
            for entry in entries:
                collected.append({
                    "type": "article",
                    "source": name,
                    "source_url": url,
                    "title": entry["title"],
                    "content": entry["summary"][:2000],
                    "link": entry["link"],
                    "date": entry["published"],
                })

        except Exception as e:
            # Handle unexpected errors
            feed_health_report[name] = {
                "url": url,
                "status": "error",
                "message": f"Unexpected error: {str(e)}",
                "total_entries": 0,
                "filtered_entries": 0,
                "fetch_time": time.time() - start_time,
                "keywords": keywords,
                "max_items": max_items
            }
            if verbose:
                print(f"  ❌ Unexpected error: {str(e)}")

    # Print feed health summary
    if verbose:
        _print_feed_health_summary(feed_health_report)

    # Check minimum items threshold
    if len(collected) < min_items_threshold:
        if verbose:
            print(f"⚠️  Warning: Only {len(collected)} items collected (threshold: {min_items_threshold})")
    elif verbose:
        print(f"✅ Successfully collected {len(collected)} items total")

    # Fetch YouTube transcripts
    if youtube_urls:
        for url in youtube_urls:
            fetch_youtube_transcript(url, output_dir=transcript_dir)

        for vtt_file in Path(transcript_dir).glob("*.vtt"):
            text = parse_vtt(str(vtt_file))
            collected.append(
                {
                    "type": "video",
                    "source": "youtube",
                    "title": vtt_file.stem.replace(".en", ""),
                    "content": text[:5000],
                    "link": str(vtt_file),
                    "date": datetime.now(),
                }
            )

    if verbose:
        print(f"\n📊 Content collection complete: {len(collected)} items from {len([f for f, s in feed_health_report.items() if s['filtered_entries'] > 0])}/{len(rss_feeds)} feeds")

    return collected, feed_health_report


def _print_feed_health_summary(feed_health_report: dict[str, dict]) -> None:
    """Print a comprehensive feed health summary."""
    print("\n" + "="*60)
    print("📊 FEED HEALTH REPORT")
    print("="*60)

    total_feeds = len(feed_health_report)
    successful_feeds = len([f for f, s in feed_health_report.items() if s['filtered_entries'] > 0])
    total_items = sum(s['filtered_entries'] for s in feed_health_report.values())

    for feed_name, status in feed_health_report.items():
        status_icon = {
            "success": "✅",
            "warning": "⚠️",
            "empty": "📭",
            "timeout": "⏰",
            "error": "❌"
        }.get(status["status"], "❓")

        print(f"{status_icon} {feed_name}")
        print(f"   URL: {status['url']}")
        print(f"   Status: {status['status'].upper()}")

        if status["message"]:
            print(f"   Message: {status['message']}")

        print(f"   Entries: {status['filtered_entries']}/{status['total_entries']} (filtered/total)")
        print(f"   Fetch time: {status['fetch_time']:.2f}s")

        if status.get("keywords"):
            print(f"   Keywords: {len(status['keywords'])} filters")
        if status.get("max_items"):
            print(f"   Max items: {status['max_items']}")
        print()

    print(f"📈 Summary: {successful_feeds}/{total_feeds} feeds successful, {total_items} items total")
    print("="*60)
