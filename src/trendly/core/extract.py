"""Extraction step: fetch urls to markdown via trafilatura, crawl4ai fallback if installed."""

import trafilatura
from fastapi import APIRouter
from pydantic import BaseModel

from trendly.config import core_config
from trendly.models.article import Article


router = APIRouter(tags=["pipeline"])


class ExtractConfig(BaseModel):
    min_length: int = 400  # chars of markdown below which the crawl4ai fallback kicks in
    fallback: bool = True


class ExtractInput(BaseModel):
    urls: list[str] = []
    results: list[Article] = []  # accepts search output directly


class ExtractOutput(BaseModel):
    articles: list[Article]
    failed: list[str]


@router.post("/extract")
def extract(data: ExtractInput) -> ExtractOutput:
    """Turn urls (or search results) into markdown articles."""
    conf = ExtractConfig(**core_config("extract"))
    pending = data.results + [Article(url=url) for url in data.urls]

    articles, failed = [], []
    for article in pending:
        markdown, title = _extract(article.url)
        if len(markdown) < conf.min_length and conf.fallback:
            markdown = _crawl(article.url) or markdown

        if markdown:
            article.markdown, article.title = markdown, article.title or title
            articles.append(article)
        else:
            failed.append(article.url)

    return ExtractOutput(articles=articles, failed=failed)


def _crawl(url: str) -> str:
    """Optional crawl4ai fallback for js-heavy pages; inert unless the extra is installed."""
    try:
        import asyncio
        from crawl4ai import AsyncWebCrawler
    except ImportError:
        return ""

    async def crawl():
        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=url)
            return str(result.markdown or "")

    return asyncio.run(crawl())


def _extract(url: str) -> tuple[str, str]:
    """Trafilatura fetch + main-content extraction; returns (markdown, title)."""
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        return "", ""

    markdown = trafilatura.extract(downloaded, output_format="markdown",
                                   include_comments=False) or ""
    meta = trafilatura.extract_metadata(downloaded)
    return markdown, (meta.title if meta else "") or ""
