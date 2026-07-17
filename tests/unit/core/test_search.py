"""Unit tests for the search step: category expansion, enrichment, and persistence."""

import httpx
import pytest

from trendly.config import data_dir
from trendly.core import search
from trendly.services import store


@pytest.fixture
def fake_searx(monkeypatch):
    """Fake searxng returning one shared and one per-term url; records queried terms."""
    terms = []

    def fake_get(url, timeout, params):
        terms.append(params["q"])
        results = [{"url": "http://a", "title": "A", "content": "aa", "engine": "bing"},
                   {"url": f"http://{len(terms)}", "title": "Q", "content": None}]
        return httpx.Response(200, json={"results": results},
                              request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake_get)
    return terms


@pytest.fixture
def fake_taggly(monkeypatch):
    """Fake taggly score/keys endpoints."""
    def fake_post(url, json, timeout):
        payloads = {"score": {"scores": [0.8] * len(json.get("candidates", []))},
                    "keys": {"keywords": ["npu", "chip", "extra"]}}
        return httpx.Response(200, json=payloads[url.rsplit("/", 1)[-1]],
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)


def test_search_expands_query_categories(fake_searx, sample_config):
    """Each query runs once per category with the category appended."""
    out = search.search(search.SearchInput(queries=["ai chips"], categories=["news", "sports"]))
    assert fake_searx == ["ai chips news", "ai chips sports"]
    assert {(r.query, r.category) for r in out.results} == {("ai chips", "news"), ("ai chips", "sports")}


def test_search_defaults_to_config_categories(fake_searx, sample_config):
    """Without an override, the configured category list applies."""
    search.search(search.SearchInput(queries=["x"]))
    assert len(fake_searx) == len(search.DEFAULT_CATEGORIES)


def test_search_topic_persists_scored_results(fake_searx, fake_taggly, sample_topic):
    """A topic search stores every result with relevance score and keywords."""
    out = search.search(search.SearchInput(topic=sample_topic, categories=["news"]))
    assert all(r.score == 0.8 and r.keywords == ["npu", "chip", "extra"][:5] for r in out.results)

    rows = store.list_searches(store.connect(data_dir() / "trendly.db"), sample_topic)
    assert len(rows) == len(out.results)
    assert rows[0]["query"] == "latest ai accelerator news"


def test_search_survives_taggly_down(fake_searx, sample_topic, monkeypatch):
    """Taggly being unreachable leaves scores at zero but still persists results."""
    def fail_post(url, json, timeout):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "post", fail_post)
    out = search.search(search.SearchInput(topic=sample_topic, categories=["news"]))
    assert out.results and all(r.score == 0.0 for r in out.results)
    assert store.list_searches(store.connect(data_dir() / "trendly.db"), sample_topic)
