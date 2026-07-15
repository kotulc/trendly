"""Regenerate the RSS feed from digest files via feedgen."""

from pathlib import Path

import frontmatter
from feedgen.feed import FeedGenerator
from pydantic import BaseModel

from trendly.config import data_dir, output_dir
from trendly.models.base import AbstractBaseCommand, EmptyModel


class PublishConfig(BaseModel):
    title: str = "Trendly"
    link: str = "http://localhost:8100"
    max_items: int = 50


class PublishParams(BaseModel):
    topic: str = ""  # empty publishes all topics into one feed


class PublishOutput(BaseModel):
    path: str
    items: int


class PublishCommand(AbstractBaseCommand):
    """Build output/feed.xml from the newest digests (optionally one topic only)."""

    name = "publish"
    Config = PublishConfig
    Params = PublishParams
    Output = PublishOutput

    def operation(self, data: EmptyModel, params: PublishParams) -> PublishOutput:
        digests = sorted(_digest_files(params.topic), key=lambda p: p.name, reverse=True)

        feed = FeedGenerator()
        feed.id(self.config.link)
        feed.title(self.config.title)
        feed.link(href=self.config.link)
        feed.description(f"{self.config.title} digest feed")

        for path in digests[:self.config.max_items]:
            post = frontmatter.load(path)
            entry = feed.add_entry(order="append")
            entry.id(post.get("url", str(path)))
            entry.title(str(post.get("title") or path.stem))
            entry.link(href=post.get("url", self.config.link))
            entry.description(str(post.get("summary") or post.content[:500]))

        out = output_dir() / "feed.xml"
        out.parent.mkdir(parents=True, exist_ok=True)
        feed.rss_file(str(out), pretty=True)
        return PublishOutput(path=str(out), items=min(len(digests), self.config.max_items))


def _digest_files(topic: str) -> list[Path]:
    """All digest markdown files, filtered to one topic when given."""
    folder = data_dir() / "digests" / topic if topic else data_dir() / "digests"
    return list(folder.rglob("*.md")) if folder.exists() else []
