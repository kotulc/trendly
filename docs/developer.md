# Developer Guide

Working notes for developing and manually testing trendly. See [README.md](README.md) for
the project overview and user-facing setup.


## Setup

```bash
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -e ".[dev]"      # add [fallback] for the crawl4ai js-rendering fallback
docker compose up -d         # searxng on :8080 + taggly on :8000
# start any openai-compatible llm server (LM Studio :1234 default; see config/config.yaml)
trendly                      # api + dashboard + scheduler on http://127.0.0.1:8100
```


## Manual testing (no dashboard required)

Every pipeline step is a typed endpoint, so FastAPI's Swagger UI at
**http://127.0.0.1:8100/docs** provides an interactive form per operation with full
request/response schemas. A typical session:

1. **Add a topic** — create `data/topics/<name>.md` (profiles are plain markdown):

   ```markdown
   ---
   queries: [latest humanoid robotics news]
   min_score: 0.5
   ---
   Robotics news I care about; exclusions in plain prose.
   ```

   Leave `queries` empty to have the llm seed them on the first run.

2. `GET /api/check` — confirm searxng/taggly/llm are all reachable.
3. `POST /api/search` — `{"topic": "robotics"}` runs every profile query across the
   configured categories (`core.search.categories`, overridable per topic profile), scores
   each result against the topic via taggly, extracts keywords, and stores everything in the
   `searches` table. Narrow it for quick tests:
   `{"topic": "robotics", "queries": ["humanoid robots"], "categories": ["technology"], "top_n": 5}`.
   Ad-hoc `{"queries": ["..."]}` without a topic searches without scoring or persistence.
   Stored results: `GET /api/topics/robotics/searches` (grouped by query + category) or the
   dashboard's Search page.
4. `POST /api/extract` — `{"urls": ["<url from step 3>"]}`; check markdown quality.
5. `POST /api/run` — `{"topic": "robotics", "dry_run": true}`; full pipeline without
   writing digests, returns found/new/extracted/kept counts.
6. Drop `dry_run` for a real run, then `GET /api/topics/robotics/items` to see stored
   items and `output/feed.xml` for the rss output.

curl equivalents work for scripting:

```bash
curl -X POST localhost:8100/api/run -H "Content-Type: application/json" -d '{"topic":"robotics"}'
```

Resetting state: delete `data/trendly.db` (item/run/source history), `data/digests/`, and
`output/` — all are regenerated. Deleting the db also clears url dedup, so re-runs re-fetch.


## Test suites

```bash
pytest tests/unit          # fast; all external services faked
pytest tests/integration   # pipeline composition tests (also faked, no services needed)
```


## Dashboard build

The dashboard is a static [mdsite](https://github.com/kotulc/mdsite) export (Jamstack):
trendly is the api backend and `dashboard/components/TopicFeed.jsx` is a dynamic island
embedded from `dashboard/content/index.md` via mdsite's `components:` config key.

```bash
# preferred: the mdsite image (same pattern as taggly/graphly docs publishing);
# the container builds on its own ephemeral mdsite copy — no local checkout touched
docker run --rm -v "$PWD/dashboard:/workspace" ghcr.io/kotulc/mdsite:latest

# alternative: a local mdsite checkout (rewrites mdsite's generated site.config.js/pages/)
node ../mdsite/scripts/cli.js build --config dashboard/mdsite.yaml
```

Output lands in `dashboard/dist/` (gitignored) and is served by trendly at `/`; the path is
the `dashboard_dir` key in `config/config.yaml`. No `BASE_PATH` is needed since the export
is served at the site root.

For theme/component development, run `next dev` in an mdsite checkout against a running
trendly server — the api allows localhost cross-origin calls, so pass
`<TopicFeed api="http://127.0.0.1:8100" />` in the dev page.


## Conventions

- One module per pipeline step in `src/trendly/core/`, each with typed pydantic
  input/output models and a single `APIRouter` included by `src/trendly/api.py`.
- Shared plain helpers live in `src/trendly/services/` (store, topics, llm).
- New pipeline functionality = a new core module, not flags on an existing one.
- Dashboard components reuse mdsite's theme classes (`chip`, `post-index`, `post-actions`);
  generic style primitives belong in mdsite's `global.css`, trendly semantics stay here.
