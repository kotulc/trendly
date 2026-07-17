"""Meta-search step: expand each query across configurable categories via SearXNG,
score results against the topic profile, extract keywords, and persist per topic."""

import re
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from trendly.config import core_config, service_url
from trendly.models.article import SearchResult
from trendly.services import store
from trendly.services.topics import load_topic


router = APIRouter(tags=["pipeline"])

DEFAULT_CATEGORIES = ["news", "headlines", "politics", "entertainment",
                      "sports", "technology", "science"]


class SearchConfig(BaseModel):
    categories: list[str] = DEFAULT_CATEGORIES  # appended to each query to diversify/group
    searx_categories: str = "news"  # searxng engine category parameter
    time_range: str = "week"
    top_n: int = 20                 # results kept per query+category group
    keywords: bool = True           # per-result taggly keyword extraction
    score_chars: int = 400          # chars of title/snippet/url text used for scoring
    timeout: float = 15.0


class SearchInput(BaseModel):
    topic: str = ""            # topic name: supplies queries, enables scoring + persistence
    queries: list[str] = []    # or explicit query strings
    categories: list[str] = [] # override; empty falls back to topic profile then config
    top_n: int = 0
    time_range: str = ""


class SearchOutput(BaseModel):
    results: list[SearchResult]


@router.post("/search")
def search(data: SearchInput) -> SearchOutput:
    """Run query x category searches, dedup per group, and store scored results.
    Requires: searxng (taggly enriches keywords/relevance when reachable)."""
    conf = SearchConfig(**core_config("search"))
    topic = load_topic(data.topic) if data.topic else None
    queries = data.queries or (topic.queries if topic else [])
    categories = (data.categories or (topic.categories if topic else [])
                  or conf.categories or [""])
    time_range = data.time_range or conf.time_range
    top_n = data.top_n or conf.top_n

    results = []
    for query in queries:
        for category in categories:
            group, seen = [], set()
            for item in _query(f"{query} {category}".strip(), time_range, conf):
                if item["url"] not in seen:
                    seen.add(item["url"])
                    group.append(SearchResult(
                        url=item["url"], title=item.get("title", ""),
                        snippet=item.get("content") or "",
                        published=item.get("publishedDate") or "",
                        engine=item.get("engine") or "", query=query, category=category))
            results += group[:top_n]

    if topic and results:
        _enrich(results, topic.body, conf)
        con = store.connect()
        for result in results:
            store.record_search(con, result, topic.name)

    return SearchOutput(results=results)


def _enrich(results: list[SearchResult], topic_body: str, conf: SearchConfig) -> None:
    """Batched topic relevance plus per-result keywords via taggly; skipped when down."""
    texts = [f"{r.title} {r.snippet} {_url_words(r.url)}"[:conf.score_chars] for r in results]
    try:
        scores = _post("score", {"query": topic_body, "candidates": texts}, conf).get("scores", [])
        for result, score in zip(results, scores):
            result.score = round(score, 4)

        if conf.keywords:
            for result, text in zip(results, texts):
                result.keywords = _post("keys", {"content": text}, conf).get("keywords", [])[:5]
    except httpx.HTTPError:
        pass


def _post(endpoint: str, payload: dict, conf: SearchConfig) -> dict:
    """One taggly API call returning the parsed JSON body."""
    response = httpx.post(f"{service_url('taggly')}/{endpoint}", json=payload,
                          timeout=conf.timeout)
    response.raise_for_status()
    return response.json()


def _query(term: str, time_range: str, conf: SearchConfig) -> list[dict]:
    """One SearXNG query; requires `formats: [html, json]` in its settings.yml."""
    response = httpx.get(f"{service_url('searxng')}/search", timeout=conf.timeout,
                         params={"q": term, "format": "json", "time_range": time_range,
                                 "categories": conf.searx_categories})
    response.raise_for_status()
    return response.json().get("results", [])


def _url_words(url: str) -> str:
    """Readable words from a url path, a keyword source when snippets are thin."""
    return re.sub(r"[^a-z0-9]+", " ", urlparse(url).path.lower()).strip()
