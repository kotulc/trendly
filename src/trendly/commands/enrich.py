"""Enrich articles via the Taggly API: tags, entities, and topic similarity scores."""

import httpx
from pydantic import BaseModel

from trendly.config import service_url
from trendly.models.article import Article
from trendly.models.base import AbstractBaseCommand
from trendly.services.topics import load_topic


class EnrichConfig(BaseModel):
    top_n: int = 8        # tags kept per article
    score_chars: int = 2000  # leading chars of markdown scored against the topic
    timeout: float = 30.0


class EnrichParams(BaseModel):
    topic: str = ""


class EnrichInput(BaseModel):
    articles: list[Article]


class EnrichOutput(BaseModel):
    articles: list[Article]


class EnrichCommand(AbstractBaseCommand):
    """Add taggly tags/entities to each article and score it against the topic profile."""

    name = "enrich"
    requires = ["taggly"]
    Config = EnrichConfig
    Params = EnrichParams
    Input = EnrichInput
    Output = EnrichOutput

    def operation(self, data: EnrichInput, params: EnrichParams) -> EnrichOutput:
        for article in data.articles:
            tags = self._post("tags", {"content": article.markdown}).get("tags", {})
            article.tags = (tags.get("ranked") or tags.get("scored") or [])[:self.config.top_n]
            article.entities = self._post("ents", {"content": article.markdown}).get("entities", [])

        if params.topic and data.articles:
            body = load_topic(params.topic).body
            candidates = [a.markdown[:self.config.score_chars] for a in data.articles]
            scores = self._post("score", {"query": body, "candidates": candidates}).get("scores", [])
            for article, score in zip(data.articles, scores):
                article.score = round(score, 4)

        return EnrichOutput(articles=data.articles)

    def _post(self, endpoint: str, payload: dict) -> dict:
        """One taggly API call returning the parsed JSON body."""
        response = httpx.post(f"{service_url('taggly')}/{endpoint}", json=payload,
                              timeout=self.config.timeout)
        response.raise_for_status()
        return response.json()
