"""Item management: list a topic's stored items, follow/unfollow sources, delete items."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from trendly.core.publish import PublishInput, publish
from trendly.services import store
from trendly.services.topics import list_topics


router = APIRouter(tags=["items"])


class Item(BaseModel):
    id: int
    url: str
    topic: str
    domain: str
    title: str
    summary: str
    tags: list[str]
    score: float
    status: str
    digest_path: str
    extracted_at: str
    followed: bool = True


class ItemsOutput(BaseModel):
    topic: str
    items: list[Item]


class FollowInput(BaseModel):
    topic: str
    domain: str
    followed: bool


class ActionOutput(BaseModel):
    ok: bool


@router.get("/topics")
def topics() -> list[str]:
    """All topic profile names."""
    return list_topics()


@router.get("/topics/{topic}/items")
def topic_items(topic: str, status: str = "") -> ItemsOutput:
    """A topic's stored items newest-first, with each source's follow state attached."""
    con = store.connect()
    follows = store.source_follows(con, topic)
    items = [Item(**row, followed=follows.get(row["domain"], 1) == 1)
             for row in store.list_items(con, topic, status)]
    return ItemsOutput(topic=topic, items=items)


@router.post("/sources/follow")
def follow_source(data: FollowInput) -> ActionOutput:
    """Follow or unfollow a source domain; unfollowed domains are skipped by future runs."""
    store.set_source_follow(store.connect(), data.domain, data.topic, int(data.followed))
    return ActionOutput(ok=True)


@router.post("/items/{item_id}/delete")
def delete_item(item_id: int) -> ActionOutput:
    """Mark an item deleted: hidden from the dashboard and feed, its digest file removed,
    and future items similar to it are blocked by the judge step."""
    con = store.connect()
    row = con.execute("SELECT digest_path FROM items WHERE id = ?", (item_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"no item with id {item_id}")

    store.set_item_status(con, item_id, "deleted")
    if row["digest_path"]:
        Path(row["digest_path"]).unlink(missing_ok=True)
        publish(PublishInput())

    return ActionOutput(ok=True)
