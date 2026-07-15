"""Shared fixtures: sample config yaml, echo command, and command registries."""

import pytest
from pydantic import BaseModel

from trendly.models.base import AbstractBaseCommand


class EchoConfig(BaseModel):
    prefix: str = "> "


class EchoParams(BaseModel):
    upper: bool = False
    times: int = 1


class EchoInput(BaseModel):
    text: str = ""


class EchoOutput(BaseModel):
    text: str


class EchoCommand(AbstractBaseCommand):
    """Echo input text with a configured prefix."""

    name = "echo"
    requires = ["taggly"]
    Config = EchoConfig
    Params = EchoParams
    Input = EchoInput
    Output = EchoOutput

    def operation(self, data: EchoInput, params: EchoParams) -> EchoOutput:
        text = (self.config.prefix + data.text) * params.times
        return EchoOutput(text=text.upper() if params.upper else text)


@pytest.fixture
def echo_registry():
    """Minimal registry holding just the echo test command."""
    return {"echo": EchoCommand()}


@pytest.fixture
def sample_config(tmp_path, monkeypatch):
    """Point TRENDLY_CONFIG at a temp yaml with non-default paths and services."""
    file = tmp_path / "config.yaml"
    file.write_text(
        "data_dir: {0}/data\noutput_dir: {0}/output\n"
        "services:\n  searxng: http://searx.test\n"
        "commands:\n  check:\n    timeout: 1.5\n".format(tmp_path.as_posix()),
        encoding="utf-8")
    monkeypatch.setenv("TRENDLY_CONFIG", str(file))
    return file


@pytest.fixture
def sample_topic(sample_config, tmp_path):
    """Write a sample topic profile under the temp data dir and return its name."""
    topics = tmp_path / "data" / "topics"
    topics.mkdir(parents=True)
    (topics / "ai-hardware.md").write_text(
        "---\nname: ai-hardware\nschedule: '0 */6 * * *'\n"
        "queries: [latest ai accelerator news]\nmin_score: 0.5\n---\n"
        "News about AI accelerators, GPUs, and inference hardware.\n", encoding="utf-8")
    return "ai-hardware"
