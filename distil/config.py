"""Configuration loading and validation."""

import tomllib
from pathlib import Path

# 15 minutes
TIMEOUT = 15 * 60


def load_config(path: str = "config.toml") -> dict:
    """Load configuration from TOML file.

    Args:
        path: Path to the config file.

    Returns:
        Configuration dictionary.

    Raises:
        FileNotFoundError: If config file doesn't exist.
    """
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    with open(config_path, "rb") as f:
        return tomllib.load(f)


def get_feeds(config: dict) -> list[dict]:
    """Extract feed configurations from config.

    Args:
        config: Loaded config dictionary.

    Returns:
        List of feed configs with url, name, max_items, keywords.
    """
    return config.get("feeds", [])


def get_llm_model(config: dict) -> str:
    """Get the configured LLM model string.

    Args:
        config: Loaded config dictionary.

    Returns:
        LiteLLM model string.
    """
    return config.get("llm", {}).get("model", "anthropic/claude-sonnet-4-20250514")


def get_output_dir(config: dict) -> Path:
    """Get output directory, expanding ~ if present.

    Args:
        config: Loaded config dictionary.

    Returns:
        Expanded Path to output directory.
    """
    dir_str = config.get("output", {}).get("directory", "~/distils")
    return Path(dir_str).expanduser()
