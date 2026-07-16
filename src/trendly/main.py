"""Entry point: serve the trendly API, dashboard, and topic scheduler."""

import sys

import uvicorn

from trendly.api import build_app
from trendly.scheduler import start_scheduler


def main() -> int:
    """Console-script entry: start the scheduler and serve on http://127.0.0.1:8100."""
    scheduler = start_scheduler()
    try:
        uvicorn.run(build_app(), host="127.0.0.1", port=8100)
    finally:
        scheduler.shutdown(wait=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
