"""Unit tests for per-command markdown docs generation."""

from trendly.docs import render_command, write_docs


def test_render_command_sections(echo_registry):
    """Docs page includes name, docstring, dependencies, and contract tables."""
    page = render_command(echo_registry["echo"])
    assert "# echo" in page and "Echo input text" in page
    assert "**External dependencies:** taggly" in page
    assert "| times | int | 1 |" in page


def test_write_docs_creates_files(echo_registry, tmp_path):
    """write_docs emits one markdown file per command."""
    assert write_docs(echo_registry, docs_dir=tmp_path) == 0
    assert (tmp_path / "echo.md").exists()
