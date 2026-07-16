"""Digest step: persist judged articles as markdown files and record items in the store."""

import re
from datetime import date

import frontmatter
from fastapi import APIRouter
from pydantic import BaseModel

from trendly.config import data_dir
from trendly.models.article import Article
from trendly.services import store


router = APIRouter(tags=["pipeline"])


class DigestInput(BaseModel):
    articles: list[Article]
    topic: str


class DigestOutput(BaseModel):
    paths: list[str]


@router.post("/digest")
def digest(data: DigestInput) -> DigestOutput:
    """Write data/digests/<topic>/<date>-<slug>.md files and track each item in the db."""
    folder = data_dir() / "digests" / data.topic
    folder.mkdir(parents=True, exist_ok=True)
    con = store.connect()

    paths = []
    for article in data.articles:
        path = folder / f"{date.today().isoformat()}-{_slug(article.title or article.url)}.md"
        path.write_bytes(frontmatter.dumps(_post(article, data.topic)).encode("utf-8"))

        store.record_item(con, article, data.topic, "digested", digest_path=str(path))
        store.bump_source(con, article.domain(), data.topic, kept=True)
        paths.append(str(path))

    return DigestOutput(paths=paths)


def _post(article: Article, topic: str) -> frontmatter.Post:
    """Digest file content: article metadata frontmatter over the extracted markdown."""
    meta = article.model_dump(exclude={"markdown", "snippet", "relevant", "dup_score"})
    return frontmatter.Post(article.markdown, topic=topic, date=date.today().isoformat(), **meta)


def _slug(text: str, max_len: int = 60) -> str:
    """Filesystem-safe slug from a title or url."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:max_len] or "article"
