"""Enrichment step: taggly tags/entities, topic similarity, and deleted-item similarity."""

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from trendly.config import core_config, service_url
from trendly.models.article import Article
from trendly.services import store
from trendly.services.topics import load_topic


router = APIRouter(tags=["pipeline"])


class EnrichConfig(BaseModel):
    top_n: int = 8           # tags kept per article
    score_chars: int = 2000  # leading chars of markdown used for similarity scoring
    timeout: float = 30.0


class EnrichInput(BaseModel):
    articles: list[Article]
    topic: str = ""  # enables topic scoring and deleted-item similarity


class EnrichOutput(BaseModel):
    articles: list[Article]


@router.post("/enrich")
def enrich(data: EnrichInput) -> EnrichOutput:
    """Add tags/entities to each article; score against the topic and its deleted items.
    Requires: taggly."""
    conf = EnrichConfig(**core_config("enrich"))

    for article in data.articles:
        tags = _post("tags", {"content": article.markdown}, conf).get("tags", {})
        article.tags = (tags.get("ranked") or tags.get("scored") or [])[:conf.top_n]
        article.entities = _post("ents", {"content": article.markdown}, conf).get("entities", [])

    if data.topic and data.articles:
        body = load_topic(data.topic).body
        deleted = store.deleted_texts(store.connect(), data.topic)

        texts = [a.markdown[:conf.score_chars] for a in data.articles]
        scores = _post("score", {"query": body, "candidates": texts}, conf).get("scores", [])
        for article, text, score in zip(data.articles, texts, scores):
            article.score = round(score, 4)
            if deleted:
                dups = _post("score", {"query": text, "candidates": deleted}, conf)
                article.dup_score = round(max(dups.get("scores", [0.0])), 4)

    return EnrichOutput(articles=data.articles)


def _post(endpoint: str, payload: dict, conf: EnrichConfig) -> dict:
    """One taggly API call returning the parsed JSON body."""
    response = httpx.post(f"{service_url('taggly')}/{endpoint}", json=payload,
                          timeout=conf.timeout)
    response.raise_for_status()
    return response.json()
