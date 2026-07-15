"""Unit tests for the enrich command against a faked Taggly API."""

import httpx
import pytest

from trendly.commands import enrich
from trendly.models.article import Article


@pytest.fixture
def fake_taggly(monkeypatch):
    """Fake taggly endpoints: ranked tags, entities, and 0.9/0.1 scores."""
    def fake_post(url, json, timeout):
        payloads = {"tags": {"tags": {"ranked": ["ai", "gpu", "chips"]}},
                    "ents": {"entities": ["Nvidia"]},
                    "score": {"scores": [0.9, 0.1][:len(json.get("candidates", []))]}}
        body = payloads[url.rsplit("/", 1)[-1]]
        return httpx.Response(200, json=body, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)


def test_enrich_adds_tags_and_entities(fake_taggly):
    """Tags are capped at top_n and entities attach per article."""
    cmd = enrich.EnrichCommand(top_n=2)
    out = cmd(enrich.EnrichInput(articles=[Article(url="http://a", markdown="text")]))
    assert out.articles[0].tags == ["ai", "gpu"]
    assert out.articles[0].entities == ["Nvidia"]


def test_enrich_scores_against_topic(fake_taggly, sample_topic):
    """With a topic param, each article gets a similarity score in input order."""
    articles = [Article(url="http://a", markdown="x"), Article(url="http://b", markdown="y")]
    out = enrich.EnrichCommand()(enrich.EnrichInput(articles=articles),
                                 enrich.EnrichParams(topic=sample_topic))
    assert [a.score for a in out.articles] == [0.9, 0.1]
