"""Unit tests for item management endpoints and the dashboard pages."""

from pathlib import Path

from trendly.config import data_dir
from trendly.core import digest
from trendly.models.article import Article
from trendly.services import store


def seed_item(topic, url="http://news.test/a", title="Big News"):
    """Digest one article so an item row and digest file exist."""
    article = Article(url=url, title=title, markdown="Body.", summary="Sum.", score=0.8)
    return digest.digest(digest.DigestInput(articles=[article], topic=topic)).paths[0]


def test_topic_items_endpoint(client, sample_topic):
    """GET /api/topics/{topic}/items returns stored items with follow state."""
    seed_item(sample_topic)
    data = client.get(f"/api/topics/{sample_topic}/items").json()
    item = data["items"][0]
    assert item["domain"] == "news.test" and item["followed"] is True


def test_follow_source_endpoint(client, sample_topic):
    """POST /api/sources/follow flips a domain's follow state."""
    seed_item(sample_topic)
    client.post("/api/sources/follow",
                json={"topic": sample_topic, "domain": "news.test", "followed": False})
    item = client.get(f"/api/topics/{sample_topic}/items").json()["items"][0]
    assert item["followed"] is False


def test_delete_item_endpoint(client, sample_topic):
    """Deleting an item marks it deleted and removes its digest file."""
    path = seed_item(sample_topic)
    item_id = client.get(f"/api/topics/{sample_topic}/items").json()["items"][0]["id"]

    assert client.post(f"/api/items/{item_id}/delete").json() == {"ok": True}
    assert not Path(path).exists()
    con = store.connect(data_dir() / "trendly.db")
    assert store.list_items(con, sample_topic)[0]["status"] == "deleted"


def test_delete_unknown_item_404s(client, sample_topic):
    """Deleting a missing id returns 404."""
    assert client.post("/api/items/999/delete").status_code == 404


def test_dashboard_static_mount(sample_config, tmp_path, monkeypatch):
    """A built dashboard export is served at / when dashboard_dir exists."""
    from fastapi.testclient import TestClient
    from trendly.api import build_app

    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>Trendly dashboard</html>", encoding="utf-8")
    monkeypatch.setattr("trendly.api.dashboard_dir", lambda: dist)

    assert "Trendly dashboard" in TestClient(build_app()).get("/").text
