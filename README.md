# trendly

AI powered news and social aggregator with a local dashboard. Trendly discovers content
through a local [SearXNG](https://docs.searxng.org/) meta search, extracts articles to
markdown digests, enriches them with [Taggly](https://github.com/kotulc/taggly) NLP, judges
relevance against user-editable topic profiles with a local LLM (any OpenAI-compatible
server: LM Studio, Ollama, vLLM), and publishes an RSS feed.

## Architecture

Each pipeline step lives in its own module under `src/trendly/core/` with typed pydantic
input/output contracts and a single API endpoint — the module docstring and Swagger UI
(`/docs`) describe each step's inputs, outputs, and service dependencies:

| Endpoint | Purpose | Requires |
|---|---|---|
| `POST /api/search` | Meta-search each query across configurable categories; results are scored, keyworded, and stored per topic | searxng, taggly |
| `POST /api/extract` | Fetch urls to markdown (trafilatura, crawl4ai fallback) | — |
| `POST /api/enrich` | Tags/entities + topic and deleted-item similarity scores | taggly |
| `POST /api/judge` | Filter low-score / deleted-similar items, llm summaries | llm |
| `POST /api/digest` | Write digest .md files, track items in sqlite | — |
| `POST /api/publish` | Regenerate `output/feed.xml` | — |
| `POST /api/run` | Full pipeline for one topic | all |
| `GET /api/check` | Health-check the external services | — |

Topic items are tracked in sqlite (`data/trendly.db`) and managed from the dashboard:

- Follow/unfollow a source: unfollowed domains are skipped by future runs
- Delete an item: hidden from dashboard and feed, and future items similar to it
  (taggly cosine similarity above `core.judge.dup_threshold`) are blocked automatically

## Dashboard

The dashboard is a static [mdsite](https://github.com/kotulc/mdsite) site (Jamstack style):
trendly is the API backend, and `dashboard/components/TopicFeed.jsx` is a dynamic island
embedded in a markdown page (`dashboard/content/index.md`) that fetches items at runtime.
mdsite supplies the theme; trendly supplies the components via mdsite's `components:` config,
so all sites built with mdsite share the same look and feel.

```bash
# build via the mdsite image (same pattern as taggly/graphly docs publishing)
docker run --rm -v "$PWD/dashboard:/workspace" ghcr.io/kotulc/mdsite:latest

# or against a local mdsite checkout (note: rewrites mdsite's generated files)
node ../mdsite/scripts/cli.js build --config dashboard/mdsite.yaml
```

The export lands in `dashboard/dist/` and is served by trendly at `/` (path configurable via
`dashboard_dir` in config.yaml). The image build needs no cleanup — the container works on its
own ephemeral mdsite copy. For theme development, run `next dev` inside mdsite against a
running trendly server — the api allows localhost cross-origin calls.

## Setup

```bash
pip install -e .                  # add [fallback] for the crawl4ai js-rendering fallback
docker compose up -d              # searxng on :8080 + taggly on :8000
# start any openai-compatible llm server (LM Studio :1234, ollama :11434/v1, vllm)
trendly                           # dashboard + api on http://127.0.0.1:8100
```

Server settings live in `config/config.yaml`: data/output paths, service urls, and
per-step defaults. The llm needs only an endpoint and model:

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
schedule: "0 */6 * * *"   # cron; runs automatically while the server is up
queries: [...]             # seeded by the llm when empty
min_score: 0.5             # taggly similarity threshold
---
Prose describing what you want (and don't want); used as llm context verbatim.
```

## Usage

```bash
trendly                                          # serve dashboard, api, and scheduler
curl -X POST localhost:8100/api/run -H "Content-Type: application/json" \
     -d '{"topic": "ai-hardware"}'               # trigger a pipeline run
curl localhost:8100/api/check                    # service health
```

Then browse `http://127.0.0.1:8100/` to switch topics, follow/unfollow sources, and
delete items; the feed lives at `output/feed.xml`.

## Development

```bash
pip install -e ".[dev]"
pytest tests/unit          # fast, all services faked
pytest tests/integration   # pipeline composition tests
```
