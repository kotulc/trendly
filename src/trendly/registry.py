"""Discover command classes in trendly.commands and instantiate them with YAML config."""

import importlib
import inspect
import pkgutil

from trendly.config import command_config
from trendly.models.base import AbstractBaseCommand


RESERVED = {"docs", "start"}


def discover_commands(config: dict = None) -> dict[str, AbstractBaseCommand]:
    """Scan the commands package and return {name: instance} for every command class."""
    package = importlib.import_module("trendly.commands")
    commands = {}

    for info in pkgutil.iter_modules(package.__path__):
        if info.name.startswith("_"):
            continue

        module = importlib.import_module(f"trendly.commands.{info.name}")
        for _, cls in inspect.getmembers(module, inspect.isclass):
            if _is_command(cls, module.__name__):
                commands[cls.name] = cls(config=cls.Config(**command_config(cls.name, config)))

    return commands


def _is_command(cls: type, module_name: str) -> bool:
    """A command is a named non-reserved AbstractBaseCommand subclass defined in the module."""
    return (issubclass(cls, AbstractBaseCommand) and cls.__module__ == module_name
            and bool(cls.name) and cls.name not in RESERVED)
