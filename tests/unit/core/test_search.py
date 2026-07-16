"""Unit tests for the search step against a faked SearXNG JSON API."""

import httpx
import pytest

from trendly.core import search


@pytest.fixture
def fake_searx(monkeypatch):
    """Fake httpx.get returning two results, one shared across queries."""
    def fake_get(url, timeout, params):
        results = [{"url": "http://a", "title": "A", "content": "aa"},
                   {"url": f"http://{params['q'][0]}", "title": "Q", "content": None}]
        return httpx.Response(200, json={"results": results},
                              request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake_get)


def test_search_dedups_across_queries(fake_searx, sample_config):
    """Duplicate urls from different queries collapse to one result."""
    out = search.search(search.SearchInput(queries=["x", "y"]))
    assert [a.url for a in out.results] == ["http://a", "http://x", "http://y"]


def test_search_top_n(fake_searx, sample_config):
    """top_n caps the merged result list."""
    out = search.search(search.SearchInput(queries=["x"], top_n=1))
    assert len(out.results) == 1


def test_search_loads_topic_queries(fake_searx, sample_topic):
    """A topic name input pulls queries from its profile."""
    assert search.search(search.SearchInput(topic=sample_topic)).results
