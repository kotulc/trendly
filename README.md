# trendly

AI powered news and social aggregator. Trendly discovers content through a local
[SearXNG](https://docs.searxng.org/) meta search, extracts articles to markdown digests,
enriches them with [Taggly](https://github.com/kotulc/taggly) NLP, judges relevance against
user-editable topic profiles with a local LLM (any OpenAI-compatible server: LM Studio,
Ollama, vLLM), and publishes an RSS feed.

## Architecture

Trendly is built on a Taggly-style command framework: each pipeline stage is one class in
`src/trendly/commands/` that is auto-registered as a CLI subcommand, a `POST /{name}` API
endpoint, and a docs page in `docs/commands/` — no wiring required. Commands read and emit
JSON, so stages compose in shell pipes.

| Command | Purpose | Requires |
|---|---|---|
| `search` | Meta-search a topic's queries via SearXNG | searxng |
| `extract` | Fetch urls to markdown (trafilatura, crawl4ai fallback) | — |
| `enrich` | Add tags/entities and topic similarity scores | taggly |
| `judge` | LLM relevance filter + summaries | llm |
| `digest` | Write digest .md files, record in sqlite | — |
| `publish` | Regenerate `output/feed.xml` | — |
| `run` | Full pipeline for one topic | all |
| `check` | Health-check the external services | — |

See `docs/commands/*.md` (regenerate with `trendly docs`) for each command's config, params,
input, and output contracts.

## Setup

```bash
pip install -e .                  # add [fallback] for the crawl4ai js-rendering fallback
docker compose up -d              # searxng on :8080 (json api enabled)
taggly start                      # taggly api on :8000
# start any openai-compatible llm server (LM Studio :1234, ollama :11434/v1, vllm)
trendly check                     # verify all three services are up
```

Server settings live in `config/config.yaml`: data/output paths, service urls, and
per-command defaults. The llm needs only an endpoint and model:

```yaml
services:
  llm:
    url: http://localhost:1234/v1
    model: local-model
```

## Topics

Topic profiles are plain markdown files in `data/topics/` — edit them freely:

```markdown
---
name: ai-hardware
schedule: "0 */6 * * *"   # cron; scheduled when `trendly start` is running
queries: [...]             # seeded by the llm when empty
min_score: 0.5             # taggly similarity threshold
---
Prose describing what you want (and don't want); used as llm context verbatim.
```

## Usage

```bash
trendly run ai-hardware                    # full pipeline: digests + feed.xml
trendly start                              # serve the api (:8100) + topic scheduler
trendly search ai-hardware --top-n 10      # any stage runs standalone...
trendly search ai-hardware | trendly extract | trendly enrich --topic ai-hardware
```

## Development

```bash
pip install -e ".[dev]"
pytest tests/unit          # fast, all services faked
pytest tests/integration   # pipeline composition tests
```
