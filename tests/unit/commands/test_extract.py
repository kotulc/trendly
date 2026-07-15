"""Unit tests for the extract command with trafilatura faked out."""

import pytest

from trendly.commands import extract
from trendly.models.article import Article


@pytest.fixture
def fake_trafilatura(monkeypatch):
    """Fake fetch/extract: /good yields long markdown, /bad yields nothing."""
    monkeypatch.setattr(extract.trafilatura, "fetch_url",
                        lambda url: "" if url.endswith("/bad") else "<html>body</html>")
    monkeypatch.setattr(extract.trafilatura, "extract",
                        lambda html, **kw: "words " * 100)
    monkeypatch.setattr(extract.trafilatura, "extract_metadata",
                        lambda html: type("M", (), {"title": "Title"})())


def test_extract_fills_markdown_and_title(fake_trafilatura):
    """Successful extraction fills markdown and missing titles."""
    out = extract.ExtractCommand()(extract.ExtractInput(urls=["http://x/good"]))
    assert out.articles[0].title == "Title" and out.articles[0].markdown.startswith("words")


def test_extract_reports_failures(fake_trafilatura):
    """Unfetchable urls land in failed, not articles."""
    out = extract.ExtractCommand()(extract.ExtractInput(urls=["http://x/bad"]))
    assert out.articles == [] and out.failed == ["http://x/bad"]


def test_extract_accepts_piped_results(fake_trafilatura):
    """Search output pipes in as results, preserving existing titles."""
    piped = extract.ExtractInput(results=[Article(url="http://x/good", title="Kept")])
    out = extract.ExtractCommand()(piped)
    assert out.articles[0].title == "Kept"
