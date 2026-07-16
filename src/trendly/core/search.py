"""Meta-search step: query SearXNG (JSON API) for a topic's queries or ad-hoc strings."""

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from trendly.config import core_config, service_url
from trendly.models.article import Article
from trendly.services.topics import load_topic


router = APIRouter(tags=["pipeline"])


class SearchConfig(BaseModel):
    categories: str = "news"
    time_range: str = "week"
    top_n: int = 20
    timeout: float = 15.0


class SearchInput(BaseModel):
    topic: str = ""       # topic name whose profile queries to run
    queries: list[str] = []  # or explicit query strings
    top_n: int = 0        # 0 uses the configured default
    time_range: str = ""


class SearchOutput(BaseModel):
    results: list[Article]


@router.post("/search")
def search(data: SearchInput) -> SearchOutput:
    """Merge and dedup SearXNG results across queries. Requires: searxng."""
    conf = SearchConfig(**core_config("search"))
    queries = data.queries or load_topic(data.topic).queries

    seen, results = set(), []
    for query in queries:
        for item in _query(query, data.time_range or conf.time_range, conf):
            if item["url"] not in seen:
                seen.add(item["url"])
                results.append(Article(url=item["url"], title=item.get("title", ""),
                                       snippet=item.get("content") or "",
                                       published=item.get("publishedDate") or ""))

    return SearchOutput(results=results[:data.top_n or conf.top_n])


def _query(query: str, time_range: str, conf: SearchConfig) -> list[dict]:
    """One SearXNG query; requires `formats: [html, json]` in its settings.yml."""
    response = httpx.get(f"{service_url('searxng')}/search", timeout=conf.timeout,
                         params={"q": query, "format": "json", "time_range": time_range,
                                 "categories": conf.categories})
    response.raise_for_status()
    return response.json().get("results", [])
