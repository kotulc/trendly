"""Health-check the external services (searxng, taggly, ollama) trendly depends on."""

import httpx
from pydantic import BaseModel

from trendly.config import services
from trendly.models.base import AbstractBaseCommand, EmptyModel


class CheckConfig(BaseModel):
    timeout: float = 3.0


class CheckOutput(BaseModel):
    services: dict[str, str]
    ok: bool


class CheckCommand(AbstractBaseCommand):
    """Ping each configured service url and report ok/down status."""

    name = "check"
    Config = CheckConfig
    Output = CheckOutput

    def operation(self, data: EmptyModel, params: EmptyModel) -> CheckOutput:
        status = {name: self._ping(conf["url"]) for name, conf in services().items()}
        return CheckOutput(services=status, ok=all(s == "ok" for s in status.values()))

    def _ping(self, url: str) -> str:
        """Any HTTP response means the service is listening; connection failure means down."""
        try:
            httpx.get(url, timeout=self.config.timeout)
            return "ok"
        except httpx.HTTPError:
            return "down"
