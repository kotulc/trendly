"""Unit tests for the sqlite metadata store."""

import pytest

from trendly.services import store


@pytest.fixture
def con(tmp_path):
    """In-temp-dir sqlite connection with schema applied."""
    return store.connect(tmp_path / "test.db")


def test_filter_new_drops_seen_urls(con):
    """Only unseen urls survive, order preserved."""
    store.record_article(con, "http://a", "t", "digested")
    assert store.filter_new(con, ["http://b", "http://a", "http://c"]) == ["http://b", "http://c"]


def test_record_article_upserts(con):
    """Re-recording a url updates its status instead of failing."""
    store.record_article(con, "http://a", "t", "extracted")
    store.record_article(con, "http://a", "t", "digested", score=0.8, digest_path="d.md")
    row = con.execute("SELECT status, score, digest_path FROM articles").fetchone()
    assert row == ("digested", 0.8, "d.md")


def test_log_run_appends(con):
    """Each run adds one history row."""
    store.log_run(con, "t", found=5, kept=2)
    assert con.execute("SELECT topic, found, kept FROM runs").fetchone() == ("t", 5, 2)


def test_bump_source_accumulates(con):
    """Source stats accumulate hits and kept counts per topic."""
    store.bump_source(con, "example.com", "t", kept=True)
    store.bump_source(con, "example.com", "t", kept=False)
    assert con.execute("SELECT hits, kept FROM sources").fetchone() == (2, 1)
