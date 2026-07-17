"""Article record passed between pipeline stages; fields fill in as stages run."""

from urllib.parse import urlparse

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
    dup_score: float = 0.0  # max similarity to items the user deleted
    relevant: bool = False
    summary: str = ""

    def domain(self) -> str:
        """Source domain, the unit that can be followed or unfollowed."""
        return urlparse(self.url).netloc


class SearchResult(Article):
    """Article plus search provenance: which query/category found it and via which engine."""

    query: str = ""
    category: str = ""
    engine: str = ""
    keywords: list[str] = []
