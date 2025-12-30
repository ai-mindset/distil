"""Main entry point for running distil as a module."""

import signal
import sys

from distil.cli import app


def signal_handler(sig, frame):
    """Handle keyboard interrupt gracefully."""
    print("\n👋 Interrupted by user")
    sys.exit(0)


if __name__ == "__main__":
    # Set up graceful interrupt handling
    signal.signal(signal.SIGINT, signal_handler)

    try:
        app()
    except KeyboardInterrupt:
        print("\n👋 Interrupted by user")
        sys.exit(0)