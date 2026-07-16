"""Publish step: regenerate the RSS feed from digest files via feedgen."""

from pathlib import Path

import frontmatter
from fastapi import APIRouter
from feedgen.feed import FeedGenerator
from pydantic import BaseModel

from trendly.config import core_config, data_dir, output_dir


router = APIRouter(tags=["pipeline"])


class PublishConfig(BaseModel):
    title: str = "Trendly"
    link: str = "http://localhost:8100"
    max_items: int = 50


class PublishInput(BaseModel):
    topic: str = ""  # empty publishes all topics into one feed


class PublishOutput(BaseModel):
    path: str
    items: int


@router.post("/publish")
def publish(data: PublishInput = None) -> PublishOutput:
    """Build output/feed.xml from the newest digests (optionally one topic only)."""
    conf = PublishConfig(**core_config("publish"))
    topic = data.topic if data else ""
    digests = sorted(_digest_files(topic), key=lambda p: p.name, reverse=True)

    feed = FeedGenerator()
    feed.id(conf.link)
    feed.title(conf.title)
    feed.link(href=conf.link)
    feed.description(f"{conf.title} digest feed")

    for path in digests[:conf.max_items]:
        post = frontmatter.load(path)
        entry = feed.add_entry(order="append")
        entry.id(post.get("url", str(path)))
        entry.title(str(post.get("title") or path.stem))
        entry.link(href=post.get("url", conf.link))
        entry.description(str(post.get("summary") or post.content[:500]))

    out = output_dir() / "feed.xml"
    out.parent.mkdir(parents=True, exist_ok=True)
    feed.rss_file(str(out), pretty=True)
    return PublishOutput(path=str(out), items=min(len(digests), conf.max_items))


def _digest_files(topic: str) -> list[Path]:
    """All digest markdown files, filtered to one topic when given."""
    folder = data_dir() / "digests" / topic if topic else data_dir() / "digests"
    return list(folder.rglob("*.md")) if folder.exists() else []
