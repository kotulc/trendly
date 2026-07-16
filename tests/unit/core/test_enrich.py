"""Unit tests for the enrich step against a faked Taggly API."""

import httpx
import pytest

from trendly.core import enrich
from trendly.models.article import Article
from trendly.services import store
from trendly.config import data_dir


@pytest.fixture
def fake_taggly(monkeypatch):
    """Fake taggly endpoints: ranked tags, entities, and descending scores."""
    def fake_post(url, json, timeout):
        n = len(json.get("candidates", []))
        payloads = {"tags": {"tags": {"ranked": ["ai", "gpu", "chips"]}},
                    "ents": {"entities": ["Nvidia"]},
                    "score": {"scores": [0.9, 0.1][:n]}}
        return httpx.Response(200, json=payloads[url.rsplit("/", 1)[-1]],
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)


def test_enrich_adds_tags_and_entities(fake_taggly, sample_config, monkeypatch):
    """Tags are capped at top_n and entities attach per article."""
    monkeypatch.setattr(enrich, "core_config", lambda name: {"top_n": 2})
    out = enrich.enrich(enrich.EnrichInput(articles=[Article(url="http://a", markdown="text")]))
    assert out.articles[0].tags == ["ai", "gpu"]
    assert out.articles[0].entities == ["Nvidia"]


def test_enrich_scores_against_topic(fake_taggly, sample_topic):
    """With a topic, each article gets a similarity score in input order."""
    articles = [Article(url="http://a", markdown="x"), Article(url="http://b", markdown="y")]
    out = enrich.enrich(enrich.EnrichInput(articles=articles, topic=sample_topic))
    assert [a.score for a in out.articles] == [0.9, 0.1]


def test_enrich_scores_deleted_similarity(fake_taggly, sample_topic):
    """Deleted items in the store yield a dup_score per article."""
    con = store.connect(data_dir() / "trendly.db")
    store.record_item(con, Article(url="http://old", title="Old", summary="S"), sample_topic, "digested")
    store.set_item_status(con, 1, "deleted")

    out = enrich.enrich(enrich.EnrichInput(
        articles=[Article(url="http://a", markdown="x")], topic=sample_topic))
    assert out.articles[0].dup_score == 0.9
