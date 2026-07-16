"""Judgment step: drop low-scoring or deleted-similar articles, llm-judge and summarize."""

from fastapi import APIRouter
from pydantic import BaseModel

from trendly.config import core_config
from trendly.models.article import Article
from trendly.services import llm
from trendly.services.topics import load_topic


router = APIRouter(tags=["pipeline"])


class JudgeConfig(BaseModel):
    model: str = ""           # empty uses the services.llm default model
    max_articles: int = 25
    dup_threshold: float = 0.75  # dup_score above this blocks the article


class JudgeInput(BaseModel):
    articles: list[Article]
    topic: str


class JudgeOutput(BaseModel):
    articles: list[Article]
    rejected: list[str]


@router.post("/judge")
def judge(data: JudgeInput) -> JudgeOutput:
    """Filter by min_score and deleted-item similarity, then llm-judge the rest.
    Requires: llm."""
    conf = JudgeConfig(**core_config("judge"))
    topic = load_topic(data.topic)

    kept, rejected = [], []
    for article in data.articles[:conf.max_articles]:
        too_weak = article.score and article.score < topic.min_score
        too_similar = article.dup_score > conf.dup_threshold
        if too_weak or too_similar:
            rejected.append(article.url)
            continue

        article.relevant, article.summary = llm.judge_article(topic, article.markdown, conf.model)
        kept.append(article) if article.relevant else rejected.append(article.url)

    return JudgeOutput(articles=kept, rejected=rejected)
