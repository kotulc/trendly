"""Generate argparse subcommands from the command registry; JSON in/out so stages compose."""

import argparse
import json
import sys

from pydantic import BaseModel

from trendly.models.base import AbstractBaseCommand


SIMPLE = (str, int, float)


def build_parser(commands: dict[str, AbstractBaseCommand]) -> argparse.ArgumentParser:
    """Build the trendly parser: one subcommand per registered command plus start/docs."""
    parser = argparse.ArgumentParser(prog="trendly", description="AI powered news aggregator")
    subs = parser.add_subparsers(dest="command")

    for name, cmd in commands.items():
        sub = subs.add_parser(name, help=_summary(cmd))
        _add_input_args(sub, cmd.Input)
        _add_param_flags(sub, cmd.Params)

    subs.add_parser("start", help="Serve the API and topic scheduler")
    subs.add_parser("docs", help="Regenerate per-command markdown docs")
    return parser


def run_cli(commands: dict[str, AbstractBaseCommand], argv: list = None) -> int:
    """Parse argv, dispatch to the matching command, and print its output as JSON."""
    parser = build_parser(commands)
    args = parser.parse_args(argv)

    if not args.command:
        parser.print_help()
        return 1
    if args.command == "start":
        from trendly.api import serve
        return serve(commands)
    if args.command == "docs":
        from trendly.docs import write_docs
        return write_docs(commands)

    cmd = commands[args.command]
    result = cmd(_collect_input(cmd, args), _collect_params(cmd, args))
    print(result.model_dump_json(indent=2))
    return 0


def _add_input_args(sub: argparse.ArgumentParser, model: type[BaseModel]) -> None:
    """Map simple Input fields to optional positionals; complex fields arrive via stdin JSON."""
    for name, field in model.model_fields.items():
        if field.annotation in SIMPLE:
            sub.add_argument(name, nargs="?", default=None)
        elif field.annotation == list[str]:
            sub.add_argument(name, nargs="*", default=None)


def _add_param_flags(sub: argparse.ArgumentParser, model: type[BaseModel]) -> None:
    """Map every Params field to a --flag; pydantic coerces the string values."""
    for name, field in model.model_fields.items():
        flag = f"--{name.replace('_', '-')}"
        if field.annotation is bool:
            sub.add_argument(flag, dest=name, action=argparse.BooleanOptionalAction, default=None)
        else:
            sub.add_argument(flag, dest=name, default=None)


def _collect_input(cmd: AbstractBaseCommand, args: argparse.Namespace) -> BaseModel:
    """Build Input from positionals, falling back to piped stdin JSON when none given."""
    fields = cmd.Input.model_fields
    values = {k: getattr(args, k) for k in fields if getattr(args, k, None) not in (None, [])}

    if not values and fields and not sys.stdin.isatty():
        return cmd.Input(**json.load(sys.stdin))
    return cmd.Input(**values)


def _collect_params(cmd: AbstractBaseCommand, args: argparse.Namespace) -> BaseModel:
    """Build Params from any --flags the user set, leaving the rest to model defaults."""
    values = {k: getattr(args, k) for k in cmd.Params.model_fields if getattr(args, k, None) is not None}
    return cmd.Params(**values)


def _summary(cmd: AbstractBaseCommand) -> str:
    """First docstring line shown as the subcommand help text."""
    return (cmd.__doc__ or "").strip().splitlines()[0] if cmd.__doc__ else ""
