"""Entry point: discover commands and dispatch to the generated CLI."""

import sys

from trendly.cli import run_cli
from trendly.registry import discover_commands


def main(argv: list = None) -> int:
    """Console-script entry: `trendly <command> [input] [--flags]`."""
    return run_cli(discover_commands(), argv)


if __name__ == "__main__":
    sys.exit(main())
