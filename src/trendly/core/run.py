"""Pipeline step: run search -> extract -> enrich -> judge -> digest -> publish for a topic."""

from fastapi import APIRouter
from pydantic import BaseModel

from trendly.config import core_config
from trendly.core.digest import DigestInput, digest
from trendly.core.enrich import EnrichInput, enrich
from trendly.core.extract import ExtractInput, extract
from trendly.core.judge import JudgeInput, judge
from trendly.core.publish import PublishInput, publish
from trendly.core.search import SearchInput, search
from trendly.models.article import Article
from trendly.services import llm, store
from trendly.services.topics import load_topic, save_topic


router = APIRouter(tags=["pipeline"])


class RunConfig(BaseModel):
    query_model: str = ""  # seeds queries for profiles without any; empty uses the llm default
    query_count: int = 5


class RunInput(BaseModel):
    topic: str
    dry_run: bool = False  # skip digest writing and rss publishing


class RunOutput(BaseModel):
    topic: str
    found: int
    new: int
    extracted: int
    kept: int
    paths: list[str]


@router.post("/run")
def run(data: RunInput) -> RunOutput:
    """Run every pipeline step in-process for one topic and log the outcome.
    Requires: searxng, taggly, llm."""
    conf = RunConfig(**core_config("run"))
    topic = load_topic(data.topic)
    if not topic.queries:
        topic.queries = llm.gen_queries(topic, conf.query_model, conf.query_count)
        save_topic(topic)

    found = search(SearchInput(queries=topic.queries)).results
    con = store.connect()
    unfollowed = {d for d, f in store.source_follows(con, topic.name).items() if f == 0}
    candidates = [a for a in found if a.domain() not in unfollowed]
    new = set(store.filter_new(con, [a.url for a in candidates]))

    extracted = extract(ExtractInput(results=[a for a in candidates if a.url in new]))
    for url in extracted.failed:
        store.record_item(con, Article(url=url), topic.name, "failed")

    enriched = enrich(EnrichInput(articles=extracted.articles, topic=topic.name))
    judged = judge(JudgeInput(articles=enriched.articles, topic=topic.name))
    by_url = {a.url: a for a in enriched.articles}
    for url in judged.rejected:
        store.record_item(con, by_url.get(url, Article(url=url)), topic.name, "rejected")

    paths = []
    if judged.articles and not data.dry_run:
        paths = digest(DigestInput(articles=judged.articles, topic=topic.name)).paths
        publish(PublishInput())

    store.log_run(con, topic.name, found=len(found), kept=len(paths))
    return RunOutput(topic=topic.name, found=len(found), new=len(new),
                     extracted=len(extracted.articles), kept=len(judged.articles), paths=paths)
