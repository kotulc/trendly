"""Load and save user-editable topic profiles: markdown files with YAML frontmatter."""

from pathlib import Path

import frontmatter
from pydantic import BaseModel

from trendly.config import data_dir


class Topic(BaseModel):
    name: str
    body: str = ""
    schedule: str = ""
    queries: list[str] = []
    categories: list[str] = []  # per-topic search category overrides; empty uses config default
    sources: list[str] = []
    min_score: float = 0.5


def list_topics() -> list[str]:
    """Names of all topic profiles present in the data dir."""
    folder = data_dir() / "topics"
    return sorted(p.stem for p in folder.glob("*.md")) if folder.exists() else []


def load_topic(name: str) -> Topic:
    """Parse a topic profile; frontmatter maps to fields, prose becomes the body."""
    post = frontmatter.load(topic_path(name))
    return Topic(**{"name": name, **post.metadata, "body": post.content.strip()})


def save_topic(topic: Topic) -> Path:
    """Write a topic profile back to disk, keeping it human-editable."""
    meta = topic.model_dump(exclude={"name", "body"}, exclude_defaults=True)
    post = frontmatter.Post(topic.body, name=topic.name, **meta)
    path = topic_path(topic.name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(frontmatter.dumps(post).encode("utf-8"))
    return path


def topic_path(name: str) -> Path:
    """Filesystem location of a topic profile."""
    return data_dir() / "topics" / f"{name}.md"
