"""Unit tests for the generated CLI: positionals, flags, and stdin piping."""

import io
import json

from trendly.cli import run_cli


def run(echo_registry, argv, capsys):
    """Run the cli and return the parsed JSON output."""
    assert run_cli(echo_registry, argv) == 0
    return json.loads(capsys.readouterr().out)


def test_run_cli_positional_input(echo_registry, capsys):
    """Simple Input fields map to positional arguments."""
    assert run(echo_registry, ["echo", "hi"], capsys) == {"text": "> hi"}


def test_run_cli_param_flags(echo_registry, capsys):
    """Params map to --flags and coerce types via pydantic."""
    out = run(echo_registry, ["echo", "hi", "--upper", "--times", "2"], capsys)
    assert out == {"text": "> HI> HI"}


def test_run_cli_stdin_json(echo_registry, capsys, monkeypatch):
    """With no positionals and piped stdin, Input parses from stdin JSON."""
    stdin = io.StringIO(json.dumps({"text": "piped"}))
    stdin.isatty = lambda: False
    monkeypatch.setattr("sys.stdin", stdin)
    assert run(echo_registry, ["echo"], capsys) == {"text": "> piped"}


def test_run_cli_no_command_shows_help(echo_registry, capsys):
    """Bare `trendly` prints help and exits non-zero."""
    assert run_cli(echo_registry, []) == 1
    assert "usage: trendly" in capsys.readouterr().out
