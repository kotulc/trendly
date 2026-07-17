"""Shared fixtures: temp config yaml, sample topic profile, and an API test client."""

import pytest
from fastapi.testclient import TestClient

from trendly.api import build_app


@pytest.fixture
def client(sample_config):
    """TestClient over the assembled app, bound to the temp config."""
    return TestClient(build_app())


@pytest.fixture
def sample_config(tmp_path, monkeypatch):
    """Point TRENDLY_CONFIG at a temp yaml with non-default paths and services."""
    file = tmp_path / "config.yaml"
    file.write_text(
        "data_dir: {0}/data\noutput_dir: {0}/output\n"
        "services:\n  searxng: http://searx.test\n"
        "core:\n  check:\n    timeout: 1.5\n".format(tmp_path.as_posix()),
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
        "queries: [latest ai accelerator news]\ncategories: [news]\nmin_score: 0.5\n---\n"
        "News about AI accelerators, GPUs, and inference hardware.\n", encoding="utf-8")
    return "ai-hardware"
