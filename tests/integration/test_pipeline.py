"""Integration tests: full run pipeline composition with all external services faked."""

import httpx
import pytest

from trendly.config import data_dir
from trendly.core import extract, run
from trendly.models.article import Article
from trendly.services import llm, store


@pytest.fixture
def fake_services(monkeypatch):
    """Fake searxng (httpx.get), taggly (httpx.post), trafilatura, and the llm."""
    def fake_get(url, timeout, params):
        results = [{"url": "http://news.test/gpu", "title": "GPU News", "content": "c"},
                   {"url": "http://blog.test/npu", "title": "NPU Post", "content": "c"}]
        return httpx.Response(200, json={"results": results},
                              request=httpx.Request("GET", url))

    def fake_post(url, json, timeout):
        n = len(json.get("candidates", []))
        payloads = {"tags": {"tags": {"ranked": ["ai"]}}, "ents": {"entities": []},
                    "score": {"scores": [0.9] * n}, "keys": {"keywords": ["gpu"]}}
        return httpx.Response(200, json=payloads[url.rsplit("/", 1)[-1]],
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "get", fake_get)
    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setattr(extract.trafilatura, "fetch_url", lambda url: "<html>x</html>")
    monkeypatch.setattr(extract.trafilatura, "extract", lambda html, **kw: "gpu words " * 60)
    monkeypatch.setattr(extract.trafilatura, "extract_metadata", lambda html: None)
    monkeypatch.setattr(llm, "judge_article", lambda t, text, m: (True, "Sum."))


def test_run_pipeline_end_to_end(fake_services, sample_topic):
    """One run finds, extracts, judges, digests, and publishes new items."""
    out = run.run(run.RunInput(topic=sample_topic))
    assert (out.found, out.new, out.extracted, out.kept) == (2, 2, 2, 2)
    assert len(out.paths) == 2

    con = store.connect(data_dir() / "trendly.db")
    assert len(store.list_items(con, sample_topic, "digested")) == 2
    assert (data_dir().parent / "output" / "feed.xml").exists()


def test_run_pipeline_idempotent(fake_services, sample_topic):
    """A second run sees no new urls and writes no duplicate digests."""
    run.run(run.RunInput(topic=sample_topic))
    again = run.run(run.RunInput(topic=sample_topic))
    assert again.new == 0 and again.paths == []


def test_run_skips_unfollowed_domains(fake_services, sample_topic):
    """Unfollowed sources are dropped before extraction."""
    con = store.connect(data_dir() / "trendly.db")
    store.set_source_follow(con, "blog.test", sample_topic, 0)
    out = run.run(run.RunInput(topic=sample_topic))
    assert out.found == 2 and out.new == 1
    assert all("news.test" in p or "gpu" in p for p in out.paths)


def test_run_blocks_deleted_similar(fake_services, sample_topic):
    """Items similar to a deleted one (dup_score 0.9 from the fake) are rejected."""
    con = store.connect(data_dir() / "trendly.db")
    store.record_item(con, Article(url="http://old/x", title="Old", summary="S"),
                      sample_topic, "digested")
    store.set_item_status(con, 1, "deleted")

    out = run.run(run.RunInput(topic=sample_topic))
    assert out.kept == 0 and out.paths == []
    statuses = {i["url"]: i["status"] for i in store.list_items(con, sample_topic)}
    assert statuses["http://news.test/gpu"] == "rejected"


def test_run_dry_run_writes_nothing(fake_services, sample_topic):
    """dry_run judges but skips digest files and rss output."""
    out = run.run(run.RunInput(topic=sample_topic, dry_run=True))
    assert out.kept == 2 and out.paths == []
    assert not (data_dir() / "digests").exists()
