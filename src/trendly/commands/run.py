"""Full pipeline for one topic: queries -> search -> extract -> enrich -> judge -> digest -> rss."""

from pydantic import BaseModel

from trendly.commands.digest import DigestCommand, DigestInput, DigestParams
from trendly.commands.enrich import EnrichCommand, EnrichInput, EnrichParams
from trendly.commands.extract import ExtractCommand, ExtractInput
from trendly.commands.judge import JudgeCommand, JudgeInput, JudgeParams
from trendly.commands.publish import PublishCommand, PublishParams
from trendly.commands.search import SearchCommand, SearchInput
from trendly.config import command_config
from trendly.models.base import AbstractBaseCommand, EmptyModel
from trendly.services import llm, store
from trendly.services.topics import load_topic, save_topic


class RunConfig(BaseModel):
    query_model: str = ""  # seeds queries for profiles without any; empty uses the llm default
    query_count: int = 5


class RunParams(BaseModel):
    dry_run: bool = False  # skip digest writing and rss publishing


class RunInput(BaseModel):
    topic: str


class RunOutput(BaseModel):
    topic: str
    found: int
    new: int
    extracted: int
    kept: int
    paths: list[str]


class RunCommand(AbstractBaseCommand):
    """Run every pipeline stage in-process for one topic and log the outcome."""

    name = "run"
    requires = ["searxng", "taggly", "llm"]
    Config = RunConfig
    Params = RunParams
    Input = RunInput
    Output = RunOutput

    def operation(self, data: RunInput, params: RunParams) -> RunOutput:
        topic = load_topic(data.topic)
        if not topic.queries:
            topic.queries = llm.gen_queries(topic, self.config.query_model, self.config.query_count)
            save_topic(topic)

        found = _stage(SearchCommand)(SearchInput(queries=topic.queries)).results
        con = store.connect()
        new = set(store.filter_new(con, [a.url for a in found]))

        extracted = _stage(ExtractCommand)(ExtractInput(results=[a for a in found if a.url in new]))
        for url in extracted.failed:
            store.record_article(con, url, topic.name, "failed")

        enriched = _stage(EnrichCommand)(EnrichInput(articles=extracted.articles),
                                         EnrichParams(topic=topic.name))
        judged = _stage(JudgeCommand)(JudgeInput(articles=enriched.articles),
                                      JudgeParams(topic=topic.name))
        for url in judged.rejected:
            store.record_article(con, url, topic.name, "rejected")

        paths = []
        if judged.articles and not params.dry_run:
            paths = _stage(DigestCommand)(DigestInput(articles=judged.articles),
                                          DigestParams(topic=topic.name)).paths
            _stage(PublishCommand)(EmptyModel(), PublishParams())

        store.log_run(con, topic.name, found=len(found), kept=len(paths))
        return RunOutput(topic=topic.name, found=len(found), new=len(new),
                         extracted=len(extracted.articles), kept=len(judged.articles), paths=paths)


def _stage(cls: type[AbstractBaseCommand]) -> AbstractBaseCommand:
    """Instantiate a stage command with its yaml config section, as the registry would."""
    return cls(config=cls.Config(**command_config(cls.name)))
