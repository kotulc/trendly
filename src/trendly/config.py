"""Load the single YAML server config and expose typed accessors for its sections."""

import os
from pathlib import Path

import yaml


DEFAULT_PATH = "config/config.yaml"

DEFAULT_SERVICES = {
    "searxng": {"url": "http://localhost:8080"},
    "taggly": {"url": "http://localhost:8000"},
    "llm": {"url": "http://localhost:1234/v1", "model": "local-model", "api_key": "not-needed"},
}


def core_config(name: str, config: dict = None) -> dict:
    """Return one pipeline step's config section used to build its Config model."""
    return (config or load_config()).get("core", {}).get(name, {})


def dashboard_dir(config: dict = None) -> Path:
    """Return the built mdsite dashboard directory served as static files."""
    return Path((config or load_config()).get("dashboard_dir", "dashboard/dist"))


def data_dir(config: dict = None) -> Path:
    """Return the local data directory (topics, digests, sqlite)."""
    return Path((config or load_config()).get("data_dir", "data"))


def load_config(path: str = None) -> dict:
    """Read config.yaml (or $TRENDLY_CONFIG); missing file yields all defaults."""
    file = Path(path or os.environ.get("TRENDLY_CONFIG", DEFAULT_PATH))
    return yaml.safe_load(file.read_text(encoding="utf-8")) or {} if file.exists() else {}


def output_dir(config: dict = None) -> Path:
    """Return the published output directory (rss feed)."""
    return Path((config or load_config()).get("output_dir", "output"))


def service(name: str, config: dict = None) -> dict:
    """Settings dict for one external service, user values merged over defaults."""
    return services(config)[name]


def service_url(name: str, config: dict = None) -> str:
    """Base url for an external service (searxng, taggly, llm)."""
    return service(name, config)["url"]


def services(config: dict = None) -> dict:
    """All service settings; yaml entries may be a bare url string or a mapping with `url`."""
    configured = (config or load_config()).get("services", {})
    merged = {}
    for name in DEFAULT_SERVICES | configured:
        entry = configured.get(name, {})
        entry = {"url": entry} if isinstance(entry, str) else entry
        merged[name] = {**DEFAULT_SERVICES.get(name, {}), **entry}
    return merged
