"""LLM relevance judgment: keep articles that fit the topic profile and summarize them."""

from pydantic import BaseModel

from trendly.models.article import Article
from trendly.models.base import AbstractBaseCommand
from trendly.services import llm
from trendly.services.topics import load_topic


class JudgeConfig(BaseModel):
    model: str = ""  # empty uses the services.llm default model
    max_articles: int = 25


class JudgeParams(BaseModel):
    topic: str = ""


class JudgeInput(BaseModel):
    articles: list[Article]


class JudgeOutput(BaseModel):
    articles: list[Article]
    rejected: list[str]


class JudgeCommand(AbstractBaseCommand):
    """Filter articles below the topic's min_score, then llm-judge and summarize the rest."""

    name = "judge"
    requires = ["llm"]
    Config = JudgeConfig
    Params = JudgeParams
    Input = JudgeInput
    Output = JudgeOutput

    def operation(self, data: JudgeInput, params: JudgeParams) -> JudgeOutput:
        topic = load_topic(params.topic)

        kept, rejected = [], []
        for article in data.articles[:self.config.max_articles]:
            if article.score and article.score < topic.min_score:
                rejected.append(article.url)
                continue

            article.relevant, article.summary = llm.judge_article(
                topic, article.markdown, self.config.model)
            kept.append(article) if article.relevant else rejected.append(article.url)

        return JudgeOutput(articles=kept, rejected=rejected)
