"""Fetch urls and extract main article content to markdown (trafilatura, crawl4ai fallback)."""

import trafilatura
from pydantic import BaseModel

from trendly.models.article import Article
from trendly.models.base import AbstractBaseCommand, EmptyModel


class ExtractConfig(BaseModel):
    min_length: int = 400
    timeout: float = 20.0
    fallback: bool = True


class ExtractInput(BaseModel):
    urls: list[str] = []
    results: list[Article] = []  # accepts piped search output directly


class ExtractOutput(BaseModel):
    articles: list[Article]
    failed: list[str]


class ExtractCommand(AbstractBaseCommand):
    """Turn urls (or piped search results) into markdown articles."""

    name = "extract"
    Config = ExtractConfig
    Input = ExtractInput
    Output = ExtractOutput

    def operation(self, data: ExtractInput, params: EmptyModel) -> ExtractOutput:
        pending = data.results + [Article(url=url) for url in data.urls]

        articles, failed = [], []
        for article in pending:
            markdown, title = self._extract(article.url)
            if len(markdown) < self.config.min_length and self.config.fallback:
                markdown = self._crawl(article.url) or markdown

            if markdown:
                article.markdown, article.title = markdown, article.title or title
                articles.append(article)
            else:
                failed.append(article.url)

        return ExtractOutput(articles=articles, failed=failed)

    def _crawl(self, url: str) -> str:
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

    def _extract(self, url: str) -> tuple[str, str]:
        """Trafilatura fetch + main-content extraction; returns (markdown, title)."""
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            return "", ""

        markdown = trafilatura.extract(downloaded, output_format="markdown",
                                       include_comments=False) or ""
        meta = trafilatura.extract_metadata(downloaded)
        return markdown, (meta.title if meta else "") or ""
