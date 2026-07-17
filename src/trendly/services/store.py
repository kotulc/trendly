"""SQLite store: topic items, run history, and per-source follow state."""

import json
import sqlite3
from pathlib import Path

from trendly.config import data_dir
from trendly.models.article import Article


SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL, topic TEXT NOT NULL, domain TEXT DEFAULT '',
    title TEXT DEFAULT '', summary TEXT DEFAULT '', tags TEXT DEFAULT '[]',
    score REAL DEFAULT 0, status TEXT DEFAULT 'new', digest_path TEXT DEFAULT '',
    extracted_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT, found INTEGER, kept INTEGER,
    finished_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sources (
    domain TEXT, topic TEXT, hits INTEGER DEFAULT 0, kept INTEGER DEFAULT 0,
    followed INTEGER DEFAULT 1,
    PRIMARY KEY (domain, topic));
CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL, query TEXT NOT NULL, category TEXT DEFAULT '',
    url TEXT NOT NULL, title TEXT DEFAULT '', snippet TEXT DEFAULT '',
    engine TEXT DEFAULT '', keywords TEXT DEFAULT '[]', score REAL DEFAULT 0,
    retrieved_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (topic, query, category, url));
"""


def bump_source(con: sqlite3.Connection, domain: str, topic: str, kept: bool) -> None:
    """Track per-domain quality: how often a source's items pass the relevance bar."""
    con.execute("INSERT INTO sources (domain, topic, hits, kept) VALUES (?, ?, 1, ?) "
                "ON CONFLICT (domain, topic) DO UPDATE SET hits = hits + 1, kept = kept + ?",
                (domain, topic, int(kept), int(kept)))
    con.commit()


def connect(path: Path = None) -> sqlite3.Connection:
    """Open (and initialize) the sqlite db under the configured data dir."""
    file = Path(path or data_dir() / "trendly.db")
    file.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(file)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def deleted_texts(con: sqlite3.Connection, topic: str, limit: int = 20) -> list[str]:
    """Title + summary of recently deleted items; negative examples for similarity blocking."""
    rows = con.execute("SELECT title, summary FROM items WHERE topic = ? AND status = 'deleted' "
                       "ORDER BY extracted_at DESC LIMIT ?", (topic, limit))
    return [f"{row['title']} {row['summary']}".strip() for row in rows]


def filter_new(con: sqlite3.Connection, urls: list[str]) -> list[str]:
    """Return only urls never seen before, preserving order."""
    seen = {row[0] for row in con.execute(
        "SELECT url FROM items WHERE url IN (%s)" % ",".join("?" * len(urls)), urls)}
    return [url for url in urls if url not in seen]


def list_items(con: sqlite3.Connection, topic: str, status: str = "") -> list[dict]:
    """Items for a topic newest-first, optionally filtered by status, tags decoded."""
    query = "SELECT * FROM items WHERE topic = ?" + (" AND status = ?" if status else "")
    rows = con.execute(query + " ORDER BY extracted_at DESC, id DESC",
                       (topic, status) if status else (topic,))
    return [{**dict(row), "tags": json.loads(row["tags"])} for row in rows]


def list_searches(con: sqlite3.Connection, topic: str, limit: int = 500) -> list[dict]:
    """Stored search results for a topic, newest-first, keywords decoded."""
    rows = con.execute("SELECT * FROM searches WHERE topic = ? "
                       "ORDER BY retrieved_at DESC, id DESC LIMIT ?", (topic, limit))
    return [{**dict(row), "keywords": json.loads(row["keywords"])} for row in rows]


def log_run(con: sqlite3.Connection, topic: str, found: int, kept: int) -> None:
    """Append one pipeline run summary to the run history."""
    con.execute("INSERT INTO runs (topic, found, kept) VALUES (?, ?, ?)", (topic, found, kept))
    con.commit()


def record_item(con: sqlite3.Connection, article: Article, topic: str, status: str,
                digest_path: str = "") -> None:
    """Upsert an item's pipeline outcome; a deleted item keeps its status on re-encounter."""
    con.execute("INSERT INTO items (url, topic, domain, title, summary, tags, score, status, "
                "digest_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (url) DO UPDATE SET "
                "title = excluded.title, summary = excluded.summary, tags = excluded.tags, "
                "score = excluded.score, digest_path = excluded.digest_path, "
                "status = CASE WHEN items.status = 'deleted' THEN 'deleted' "
                "ELSE excluded.status END",
                (article.url, topic, article.domain(), article.title, article.summary,
                 json.dumps(article.tags), article.score, status, digest_path))
    con.commit()


def record_search(con: sqlite3.Connection, result, topic: str) -> None:
    """Upsert one search result row; re-retrieval refreshes score/keywords/timestamp."""
    con.execute("INSERT INTO searches (topic, query, category, url, title, snippet, engine, "
                "keywords, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT (topic, query, category, url) DO UPDATE SET "
                "title = excluded.title, snippet = excluded.snippet, engine = excluded.engine, "
                "keywords = excluded.keywords, score = excluded.score, "
                "retrieved_at = CURRENT_TIMESTAMP",
                (topic, result.query, result.category, result.url, result.title,
                 result.snippet, result.engine, json.dumps(result.keywords), result.score))
    con.commit()


def set_item_status(con: sqlite3.Connection, item_id: int, status: str) -> bool:
    """Update one item's status (e.g. 'deleted'); False when the id is unknown."""
    changed = con.execute("UPDATE items SET status = ? WHERE id = ?", (status, item_id)).rowcount
    con.commit()
    return bool(changed)


def set_source_follow(con: sqlite3.Connection, domain: str, topic: str, followed: int) -> None:
    """Set a source's follow state for a topic: 1 followed (default), 0 unfollowed."""
    con.execute("INSERT INTO sources (domain, topic, followed) VALUES (?, ?, ?) "
                "ON CONFLICT (domain, topic) DO UPDATE SET followed = ?",
                (domain, topic, followed, followed))
    con.commit()


def source_follows(con: sqlite3.Connection, topic: str) -> dict[str, int]:
    """Follow state per domain for a topic; unlisted domains are neutral (0)."""
    rows = con.execute("SELECT domain, followed FROM sources WHERE topic = ?", (topic,))
    return {row["domain"]: row["followed"] for row in rows}
