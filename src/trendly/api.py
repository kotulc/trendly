"""FastAPI app: pipeline step endpoints plus the static mdsite dashboard export."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from trendly.config import dashboard_dir
from trendly.core import check, digest, enrich, extract, items, judge, publish, run, search


def build_app() -> FastAPI:
    """Assemble the app: core routers under /api, dashboard static files at /."""
    app = FastAPI(title="trendly", description="AI powered news aggregator")

    # Allow the mdsite dev server (next dev) to call the api cross-origin locally
    app.add_middleware(CORSMiddleware, allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
                       allow_methods=["*"], allow_headers=["*"])

    for module in (search, extract, enrich, judge, digest, publish, run, check, items):
        app.include_router(module.router, prefix="/api")

    dist = dashboard_dir()
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="dashboard")

    return app
