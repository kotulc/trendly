"""Integration tests: full run pipeline composition with all external services faked."""

import httpx
import pytest

from trendly.commands import extract, run
from trendly.services import llm, store
from trendly.config import data_dir


@pytest.fixture
def fake_services(monkeypatch):
    """Fake searxng (httpx.get), taggly (httpx.post), trafilatura, and the llm."""
    def fake_get(url, timeout, params):
        results = [{"url": "http://news.test/gpu", "title": "GPU News", "content": "c"},
                   {"url": "http://news.test/soup", "title": "Soup", "content": "c"}]
        return httpx.Response(200, json={"results": results},
                              request=httpx.Request("GET", url))

    def fake_post(url, json, timeout):
        n = len(json.get("candidates", []))
        payloads = {"tags": {"tags": {"ranked": ["ai"]}}, "ents": {"entities": []},
                    "score": {"scores": [0.9] * n}}
        return httpx.Response(200, json=payloads[url.rsplit("/", 1)[-1]],
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "get", fake_get)
    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setattr(extract.trafilatura, "fetch_url", lambda url: "<html>x</html>")
    monkeypatch.setattr(extract.trafilatura, "extract", lambda html, **kw: "gpu words " * 60)
    monkeypatch.setattr(extract.trafilatura, "extract_metadata", lambda html: None)
    monkeypatch.setattr(llm, "judge_article", lambda t, text, m: (True, "Sum."))
    monkeypatch.setattr(run.llm, "judge_article", llm.judge_article, raising=False)


def test_run_pipeline_end_to_end(fake_services, sample_topic):
    """One run finds, extracts, judges, digests, and publishes new articles."""
    out = run.RunCommand()(run.RunInput(topic=sample_topic))
    assert (out.found, out.new, out.extracted, out.kept) == (2, 2, 2, 2)
    assert len(out.paths) == 2
    assert (data_dir().parent / "output" / "feed.xml").exists()


def test_run_pipeline_idempotent(fake_services, sample_topic):
    """A second run sees no new urls and writes no duplicate digests."""
    run.RunCommand()(run.RunInput(topic=sample_topic))
    again = run.RunCommand()(run.RunInput(topic=sample_topic))
    assert again.new == 0 and again.paths == []

    con = store.connect(data_dir() / "trendly.db")
    assert con.execute("SELECT COUNT(*) FROM runs").fetchone() == (2,)


def test_run_dry_run_writes_nothing(fake_services, sample_topic):
    """--dry-run judges but skips digest files and rss output."""
    out = run.RunCommand()(run.RunInput(topic=sample_topic), run.RunParams(dry_run=True))
    assert out.kept == 2 and out.paths == []
    assert not (data_dir() / "digests").exists()
