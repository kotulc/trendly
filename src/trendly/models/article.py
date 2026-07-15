"""Article record passed between pipeline stages; fields fill in as stages run."""

from pydantic import BaseModel


class Article(BaseModel):
    url: str
    title: str = ""
    snippet: str = ""
    published: str = ""
    markdown: str = ""
    tags: list[str] = []
    entities: list[str] = []
    score: float = 0.0
    relevant: bool = False
    summary: str = ""
