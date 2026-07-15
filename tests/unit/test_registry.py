"""Unit tests for command discovery and registration rules."""

from trendly.models.base import AbstractBaseCommand, EmptyModel
from trendly.registry import _is_command, discover_commands
from tests.conftest import EchoCommand


class Unnamed(AbstractBaseCommand):
    def operation(self, data, params):
        return EmptyModel()


class Reserved(AbstractBaseCommand):
    name = "docs"

    def operation(self, data, params):
        return EmptyModel()


def test_discover_finds_check():
    """Scanning trendly.commands registers the check command instance."""
    commands = discover_commands(config={})
    assert "check" in commands
    assert isinstance(commands["check"], AbstractBaseCommand)


def test_discover_applies_yaml_config():
    """Per-command yaml sections populate each command's Config model."""
    commands = discover_commands(config={"commands": {"check": {"timeout": 9.0}}})
    assert commands["check"].config.timeout == 9.0


def test_is_command_rules():
    """Only named, non-reserved subclasses defined in the module qualify."""
    assert _is_command(EchoCommand, EchoCommand.__module__)
    assert not _is_command(Unnamed, Unnamed.__module__)
    assert not _is_command(Reserved, Reserved.__module__)
    assert not _is_command(EchoCommand, "some.other.module")
