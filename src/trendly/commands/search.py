"""Meta-search via the SearXNG JSON API for a topic's queries or ad-hoc query strings."""

import httpx
from pydantic import BaseModel

from trendly.config import service_url
from trendly.models.article import Article
from trendly.models.base import AbstractBaseCommand
from trendly.services.topics import load_topic


class SearchConfig(BaseModel):
    categories: str = "news"
    time_range: str = "week"
    top_n: int = 20
    timeout: float = 15.0


class SearchParams(BaseModel):
    top_n: int = 0
    time_range: str = ""


class SearchInput(BaseModel):
    topic: str = ""
    queries: list[str] = []


class SearchOutput(BaseModel):
    results: list[Article]


class SearchCommand(AbstractBaseCommand):
    """Query SearXNG for fresh results; input is a topic name or explicit queries."""

    name = "search"
    requires = ["searxng"]
    Config = SearchConfig
    Params = SearchParams
    Input = SearchInput
    Output = SearchOutput

    def operation(self, data: SearchInput, params: SearchParams) -> SearchOutput:
        queries = data.queries or load_topic(data.topic).queries
        time_range = params.time_range or self.config.time_range

        seen, results = set(), []
        for query in queries:
            for item in self._search(query, time_range):
                if item["url"] not in seen:
                    seen.add(item["url"])
                    results.append(Article(url=item["url"], title=item.get("title", ""),
                                           snippet=item.get("content") or "",
                                           published=item.get("publishedDate") or ""))

        return SearchOutput(results=results[:params.top_n or self.config.top_n])

    def _search(self, query: str, time_range: str) -> list[dict]:
        """One SearXNG query; requires `formats: [html, json]` in its settings.yml."""
        response = httpx.get(f"{service_url('searxng')}/search", timeout=self.config.timeout,
                             params={"q": query, "format": "json", "time_range": time_range,
                                     "categories": self.config.categories})
        response.raise_for_status()
        return response.json().get("results", [])
