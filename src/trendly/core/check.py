"""Health step: ping the external services (searxng, taggly, llm) trendly depends on."""

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from trendly.config import core_config, services


router = APIRouter(tags=["status"])


class CheckConfig(BaseModel):
    timeout: float = 3.0


class CheckOutput(BaseModel):
    services: dict[str, str]
    ok: bool


@router.get("/check")
def check() -> CheckOutput:
    """Ping each configured service url and report ok/down status."""
    conf = CheckConfig(**core_config("check"))
    status = {name: _ping(entry["url"], conf.timeout) for name, entry in services().items()}
    return CheckOutput(services=status, ok=all(s == "ok" for s in status.values()))


def _ping(url: str, timeout: float) -> str:
    """Any HTTP response means the service is listening; connection failure means down."""
    try:
        httpx.get(url, timeout=timeout)
        return "ok"
    except httpx.HTTPError:
        return "down"
