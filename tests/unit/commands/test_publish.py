"""Unit tests for rss feed generation from digest files."""

from trendly.commands import digest, publish
from trendly.models.article import Article


def make_digests(topic, count=3):
    """Write a few digests through the digest command."""
    articles = [Article(url=f"http://x/{i}", title=f"Item {i}", markdown="Body.",
                        summary=f"Summary {i}.") for i in range(count)]
    digest.DigestCommand()(digest.DigestInput(articles=articles),
                           digest.DigestParams(topic=topic))


def test_publish_builds_feed(sample_topic):
    """feed.xml is written with one rss item per digest."""
    make_digests(sample_topic)
    out = publish.PublishCommand()()
    assert out.items == 3
    content = open(out.path, encoding="utf-8").read()
    assert "<rss" in content and "Item 0" in content and "Summary 1." in content


def test_publish_max_items_cap(sample_topic):
    """max_items limits the feed length."""
    make_digests(sample_topic)
    out = publish.PublishCommand(max_items=2)()
    assert out.items == 2
