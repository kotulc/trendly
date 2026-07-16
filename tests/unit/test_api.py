"""Unit tests for app assembly: every pipeline step is exposed under /api."""

def test_openapi_lists_pipeline_steps(client):
    """Each core step registers its endpoint in the schema."""
    paths = client.get("/openapi.json").json()["paths"]
    for step in ("search", "extract", "enrich", "judge", "digest", "publish", "run", "check"):
        assert f"/api/{step}" in paths


def test_check_endpoint(client, monkeypatch):
    """GET /api/check reports one status per configured service."""
    import httpx
    monkeypatch.setattr(httpx, "get", lambda url, timeout: httpx.Response(200))
    data = client.get("/api/check").json()
    assert set(data["services"]) == {"searxng", "taggly", "llm"} and data["ok"]
