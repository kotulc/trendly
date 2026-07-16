"""Unit tests for digest file writing and item bookkeeping."""

import frontmatter

from trendly.config import data_dir
from trendly.core import digest
from trendly.models.article import Article
from trendly.services import store


def test_digest_writes_frontmatter_file(sample_topic):
    """Digest files carry url/tags/score frontmatter over the markdown body."""
    article = Article(url="http://x/a", title="Big News", markdown="Body text.",
                      tags=["ai"], score=0.7, summary="Sum.")
    out = digest.digest(digest.DigestInput(articles=[article], topic=sample_topic))

    post = frontmatter.load(out.paths[0])
    assert post["url"] == "http://x/a" and post["tags"] == ["ai"] and post["score"] == 0.7
    assert post.content == "Body text." and "big-news" in out.paths[0]


def test_digest_records_item_and_source(sample_topic):
    """Each digest write upserts the item row and bumps its source domain."""
    article = Article(url="http://news.test/a", title="T", markdown="Body.")
    digest.digest(digest.DigestInput(articles=[article], topic=sample_topic))

    con = store.connect(data_dir() / "trendly.db")
    item = store.list_items(con, sample_topic, "digested")[0]
    assert item["domain"] == "news.test" and item["title"] == "T"
    assert store.source_follows(con, sample_topic) == {"news.test": 1}
