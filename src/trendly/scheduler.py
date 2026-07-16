"""APScheduler wiring: fire the run step per topic on each profile's cron schedule."""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from trendly.core.run import RunInput, run
from trendly.services.topics import list_topics, load_topic


def start_scheduler() -> BackgroundScheduler:
    """Schedule one run job per topic profile that declares a cron schedule."""
    scheduler = BackgroundScheduler()

    for name in list_topics():
        topic = load_topic(name)
        if topic.schedule:
            scheduler.add_job(run, CronTrigger.from_crontab(topic.schedule),
                              kwargs={"data": RunInput(topic=name)}, id=name, name=f"run:{name}")

    scheduler.start()
    return scheduler
