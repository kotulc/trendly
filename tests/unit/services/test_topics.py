"""Unit tests for topic profile load/save round-trips."""

from trendly.services import topics


def test_load_topic_parses_frontmatter(sample_topic):
    """Frontmatter maps to fields and prose becomes the body."""
    topic = topics.load_topic(sample_topic)
    assert topic.queries == ["latest ai accelerator news"]
    assert topic.min_score == 0.5
    assert "AI accelerators" in topic.body


def test_save_topic_round_trip(sample_topic):
    """Saving then loading preserves fields and body."""
    topic = topics.load_topic(sample_topic)
    topic.queries.append("npu benchmark 2026")
    topics.save_topic(topic)
    assert topics.load_topic(sample_topic).queries[-1] == "npu benchmark 2026"


def test_list_topics(sample_topic):
    """All profile stems under data/topics are listed."""
    assert topics.list_topics() == [sample_topic]
