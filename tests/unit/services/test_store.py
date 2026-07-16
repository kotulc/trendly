"""Unit tests for the sqlite item store."""

import pytest

from trendly.models.article import Article
from trendly.services import store


@pytest.fixture
def con(tmp_path):
    """In-temp-dir sqlite connection with schema applied."""
    return store.connect(tmp_path / "test.db")


def article(url="http://news.test/a", **kwargs):
    return Article(url=url, **kwargs)


def test_filter_new_drops_seen_urls(con):
    """Only unseen urls survive, order preserved."""
    store.record_item(con, article(), "t", "digested")
    assert store.filter_new(con, ["http://b", "http://news.test/a"]) == ["http://b"]


def test_record_item_upserts(con):
    """Re-recording a url updates fields instead of failing."""
    store.record_item(con, article(title="Old"), "t", "extracted")
    store.record_item(con, article(title="New", score=0.8), "t", "digested", digest_path="d.md")
    row = con.execute("SELECT title, status, score, domain FROM items").fetchone()
    assert tuple(row) == ("New", "digested", 0.8, "news.test")


def test_record_item_keeps_deleted_status(con):
    """A deleted item stays deleted even if the pipeline re-records it."""
    store.record_item(con, article(), "t", "digested")
    store.set_item_status(con, 1, "deleted")
    store.record_item(con, article(), "t", "digested")
    assert con.execute("SELECT status FROM items").fetchone()[0] == "deleted"


def test_list_items_newest_first_with_status(con):
    """Items filter by status and decode tags json."""
    store.record_item(con, article("http://a", tags=["x"]), "t", "digested")
    store.record_item(con, article("http://b"), "t", "rejected")
    items = store.list_items(con, "t", "digested")
    assert [i["url"] for i in items] == ["http://a"] and items[0]["tags"] == ["x"]


def test_deleted_texts_returns_negatives(con):
    """Deleted items expose title+summary as negative examples."""
    store.record_item(con, article(title="Bad", summary="Spam."), "t", "digested")
    store.set_item_status(con, 1, "deleted")
    assert store.deleted_texts(con, "t") == ["Bad Spam."]


def test_source_follow_round_trip(con):
    """Follow state persists per domain+topic; bump keeps the default followed."""
    store.bump_source(con, "news.test", "t", kept=True)
    assert store.source_follows(con, "t") == {"news.test": 1}
    store.set_source_follow(con, "news.test", "t", 0)
    assert store.source_follows(con, "t") == {"news.test": 0}


def test_log_run_appends(con):
    """Each run adds one history row."""
    store.log_run(con, "t", found=5, kept=2)
    assert tuple(con.execute("SELECT topic, found, kept FROM runs").fetchone()) == ("t", 5, 2)
