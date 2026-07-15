"""Render docs/commands/*.md from each command's docstring, contracts, and dependencies."""

from pathlib import Path

from pydantic import BaseModel

from trendly.models.base import AbstractBaseCommand


DOCS_DIR = Path("docs/commands")


def render_command(cmd: AbstractBaseCommand) -> str:
    """Render one command's markdown page: purpose, dependencies, and contract tables."""
    requires = ", ".join(cmd.requires) or "none"
    sections = [f"# {cmd.name}", "", (cmd.__doc__ or "").strip(), "",
                f"**External dependencies:** {requires}", ""]

    for title, model in [("Config", cmd.Config), ("Params", cmd.Params),
                         ("Input", cmd.Input), ("Output", cmd.Output)]:
        sections += [f"## {title}", "", _field_table(model), ""]

    return "\n".join(sections)


def write_docs(commands: dict[str, AbstractBaseCommand], docs_dir: Path = DOCS_DIR) -> int:
    """Write a markdown page per command (the reserved `docs` command)."""
    docs_dir.mkdir(parents=True, exist_ok=True)

    for name, cmd in commands.items():
        (docs_dir / f"{name}.md").write_text(render_command(cmd), encoding="utf-8")

    print(f"Wrote {len(commands)} command docs to {docs_dir}")
    return 0


def _field_table(model: type[BaseModel]) -> str:
    """Markdown table of a contract model's fields, types, and defaults."""
    if not model.model_fields:
        return "*(none)*"

    rows = ["| field | type | default |", "|---|---|---|"]
    for name, field in model.model_fields.items():
        default = "required" if field.is_required() else repr(field.get_default(call_default_factory=True))
        rows.append(f"| {name} | {_type_name(field.annotation)} | {default} |")

    return "\n".join(rows)


def _type_name(annotation) -> str:
    """Compact type label for the docs table."""
    return getattr(annotation, "__name__", str(annotation)).replace("typing.", "")
