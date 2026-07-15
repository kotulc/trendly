"""SQLite metadata store: article dedup, run history, and discovered source stats."""

import sqlite3
from pathlib import Path

from trendly.config import data_dir


SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    url TEXT PRIMARY KEY, topic TEXT, status TEXT, score REAL DEFAULT 0,
    digest_path TEXT DEFAULT '', fetched_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT, found INTEGER, kept INTEGER,
    finished_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sources (
    domain TEXT, topic TEXT, hits INTEGER DEFAULT 0, kept INTEGER DEFAULT 0,
    PRIMARY KEY (domain, topic));
"""


def bump_source(con: sqlite3.Connection, domain: str, topic: str, kept: bool) -> None:
    """Track per-domain quality: how often a source's articles pass the relevance bar."""
    con.execute("INSERT INTO sources (domain, topic, hits, kept) VALUES (?, ?, 1, ?) "
                "ON CONFLICT (domain, topic) DO UPDATE SET hits = hits + 1, kept = kept + ?",
                (domain, topic, int(kept), int(kept)))
    con.commit()


def connect(path: Path = None) -> sqlite3.Connection:
    """Open (and initialize) the sqlite db under the configured data dir."""
    file = Path(path or data_dir() / "trendly.db")
    file.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(file)
    con.executescript(SCHEMA)
    return con


def filter_new(con: sqlite3.Connection, urls: list[str]) -> list[str]:
    """Return only urls never seen before, preserving order."""
    seen = {row[0] for row in con.execute(
        "SELECT url FROM articles WHERE url IN (%s)" % ",".join("?" * len(urls)), urls)}
    return [url for url in urls if url not in seen]


def log_run(con: sqlite3.Connection, topic: str, found: int, kept: int) -> None:
    """Append one pipeline run summary to the run history."""
    con.execute("INSERT INTO runs (topic, found, kept) VALUES (?, ?, ?)", (topic, found, kept))
    con.commit()


def record_article(con: sqlite3.Connection, url: str, topic: str, status: str,
                   score: float = 0.0, digest_path: str = "") -> None:
    """Upsert an article's pipeline outcome (extracted, rejected, digested, failed)."""
    con.execute("INSERT INTO articles (url, topic, status, score, digest_path) "
                "VALUES (?, ?, ?, ?, ?) ON CONFLICT (url) DO UPDATE SET "
                "status = excluded.status, score = excluded.score, "
                "digest_path = excluded.digest_path", (url, topic, status, score, digest_path))
    con.commit()
