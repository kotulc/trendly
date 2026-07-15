"""Unit tests for trendly.config yaml loading and accessors."""

from pathlib import Path

from trendly import config


def test_load_config_missing_file(monkeypatch, tmp_path):
    """Missing config file yields an empty dict so all defaults apply."""
    monkeypatch.setenv("TRENDLY_CONFIG", str(tmp_path / "absent.yaml"))
    assert config.load_config() == {}


def test_load_config_reads_env_path(sample_config):
    """TRENDLY_CONFIG env var selects the yaml file to load."""
    assert "services" in config.load_config()


def test_command_config_section(sample_config):
    """Per-command sections are returned by name, empty when absent."""
    assert config.command_config("check") == {"timeout": 1.5}
    assert config.command_config("unknown") == {}


def test_service_url_merges_defaults(sample_config):
    """Bare url strings normalize; unconfigured services keep defaults."""
    assert config.service_url("searxng") == "http://searx.test"
    assert config.service_url("taggly") == config.DEFAULT_SERVICES["taggly"]["url"]


def test_service_mapping_merges_extras(monkeypatch, tmp_path):
    """Mapping entries override single keys while inheriting the rest of the defaults."""
    file = tmp_path / "c.yaml"
    file.write_text("services:\n  llm:\n    model: qwen3-4b\n", encoding="utf-8")
    monkeypatch.setenv("TRENDLY_CONFIG", str(file))
    assert config.service("llm")["model"] == "qwen3-4b"
    assert config.service("llm")["url"] == config.DEFAULT_SERVICES["llm"]["url"]


def test_dirs_from_config(sample_config, tmp_path):
    """data_dir and output_dir resolve from the yaml."""
    assert config.data_dir() == Path(tmp_path.as_posix()) / "data"
    assert config.output_dir() == Path(tmp_path.as_posix()) / "output"
