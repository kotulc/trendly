"""Generate FastAPI endpoints from the command registry; one POST route per command."""

import inspect

from fastapi import Depends, FastAPI

from trendly.models.base import AbstractBaseCommand


def build_app(commands: dict[str, AbstractBaseCommand]) -> FastAPI:
    """Create the API app with a typed POST /{name} endpoint for every command."""
    app = FastAPI(title="trendly", description="AI powered news aggregator")

    for name, cmd in commands.items():
        app.post(f"/{name}", response_model=cmd.Output, summary=_summary(cmd))(_endpoint(cmd))

    return app


def serve(commands: dict[str, AbstractBaseCommand]) -> int:
    """Run the API server plus the topic scheduler (the reserved `start` command)."""
    import uvicorn
    from trendly.scheduler import start_scheduler

    scheduler = start_scheduler(commands)
    try:
        uvicorn.run(build_app(commands), host="127.0.0.1", port=8100)
    finally:
        scheduler.shutdown(wait=False)
    return 0


def _endpoint(cmd: AbstractBaseCommand):
    """Wrap a command as a route handler: Input is the body, Params map to query params."""
    def handler(data, params):
        return cmd(data, params)

    handler.__name__ = cmd.name
    handler.__doc__ = cmd.__doc__
    handler.__signature__ = inspect.Signature([
        inspect.Parameter("data", inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=cmd.Input),
        inspect.Parameter("params", inspect.Parameter.POSITIONAL_OR_KEYWORD,
                          annotation=cmd.Params, default=Depends()),
        ])
    return handler


def _summary(cmd: AbstractBaseCommand) -> str:
    """First docstring line shown in the Swagger UI."""
    return (cmd.__doc__ or "").strip().splitlines()[0] if cmd.__doc__ else ""
