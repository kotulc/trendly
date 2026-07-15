"""Unit tests for the judge command with the llm faked out."""

import pytest

from trendly.commands import judge
from trendly.models.article import Article


@pytest.fixture
def fake_llm(monkeypatch):
    """Fake judge_article: relevant iff the markdown mentions 'gpu'."""
    monkeypatch.setattr(judge.llm, "judge_article",
                        lambda topic, text, model: ("gpu" in text, "A summary."))


def test_judge_keeps_relevant_articles(fake_llm, sample_topic):
    """LLM-relevant articles are kept with summaries; others are rejected."""
    articles = [Article(url="http://a", markdown="new gpu"), Article(url="http://b", markdown="soup")]
    out = judge.JudgeCommand()(judge.JudgeInput(articles=articles),
                               judge.JudgeParams(topic=sample_topic))
    assert [a.url for a in out.articles] == ["http://a"]
    assert out.articles[0].summary == "A summary."
    assert out.rejected == ["http://b"]


def test_judge_min_score_short_circuits(fake_llm, sample_topic):
    """Articles scored below the topic's min_score are rejected without an llm call."""
    articles = [Article(url="http://a", markdown="gpu", score=0.1)]
    out = judge.JudgeCommand()(judge.JudgeInput(articles=articles),
                               judge.JudgeParams(topic=sample_topic))
    assert out.articles == [] and out.rejected == ["http://a"]
