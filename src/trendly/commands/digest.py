"""Write judged articles as markdown digest files and record outcomes in the store."""

import re
from datetime import date
from urllib.parse import urlparse

import frontmatter
from pydantic import BaseModel

from trendly.config import data_dir
from trendly.models.article import Article
from trendly.models.base import AbstractBaseCommand
from trendly.services import store


class DigestParams(BaseModel):
    topic: str = ""


class DigestInput(BaseModel):
    articles: list[Article]


class DigestOutput(BaseModel):
    paths: list[str]


class DigestCommand(AbstractBaseCommand):
    """Persist articles to data/digests/<topic>/<date>-<slug>.md with metadata frontmatter."""

    name = "digest"
    Params = DigestParams
    Input = DigestInput
    Output = DigestOutput

    def operation(self, data: DigestInput, params: DigestParams) -> DigestOutput:
        folder = data_dir() / "digests" / (params.topic or "general")
        folder.mkdir(parents=True, exist_ok=True)
        con = store.connect()

        paths = []
        for article in data.articles:
            path = folder / f"{date.today().isoformat()}-{_slug(article.title or article.url)}.md"
            path.write_bytes(frontmatter.dumps(_post(article, params.topic)).encode("utf-8"))

            store.record_article(con, article.url, params.topic, "digested",
                                 score=article.score, digest_path=str(path))
            store.bump_source(con, urlparse(article.url).netloc, params.topic, kept=True)
            paths.append(str(path))

        return DigestOutput(paths=paths)


def _post(article: Article, topic: str) -> frontmatter.Post:
    """Digest file content: article metadata frontmatter over the extracted markdown."""
    meta = article.model_dump(exclude={"markdown", "snippet", "relevant"})
    return frontmatter.Post(article.markdown, topic=topic, date=date.today().isoformat(), **meta)


def _slug(text: str, max_len: int = 60) -> str:
    """Filesystem-safe slug from a title or url."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:max_len] or "article"
