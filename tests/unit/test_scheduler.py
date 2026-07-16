"""Unit tests for cron job wiring from topic profiles."""

from trendly.scheduler import start_scheduler


def test_scheduler_adds_topic_jobs(sample_topic):
    """Topics with a cron schedule get one named run job."""
    scheduler = start_scheduler()
    try:
        assert [job.id for job in scheduler.get_jobs()] == [sample_topic]
    finally:
        scheduler.shutdown(wait=False)
