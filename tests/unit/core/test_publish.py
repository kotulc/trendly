"""Unit tests for rss feed generation from digest files."""

from trendly.core import digest, publish
from trendly.models.article import Article


def make_digests(topic, count=3):
    """Write a few digests through the digest step."""
    articles = [Article(url=f"http://x/{i}", title=f"Item {i}", markdown="Body.",
                        summary=f"Summary {i}.") for i in range(count)]
    digest.digest(digest.DigestInput(articles=articles, topic=topic))


def test_publish_builds_feed(sample_topic):
    """feed.xml is written with one rss item per digest."""
    make_digests(sample_topic)
    out = publish.publish(publish.PublishInput())
    assert out.items == 3
    content = open(out.path, encoding="utf-8").read()
    assert "<rss" in content and "Item 0" in content and "Summary 1." in content


def test_publish_max_items_cap(sample_topic, monkeypatch):
    """max_items limits the feed length."""
    monkeypatch.setattr(publish, "core_config", lambda name: {"max_items": 2})
    make_digests(sample_topic)
    assert publish.publish(publish.PublishInput()).items == 2
