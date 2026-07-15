"""Unit tests for the generated FastAPI app: body input, query params, schema docs."""

from fastapi.testclient import TestClient

from trendly.api import build_app


def test_post_endpoint_runs_command(echo_registry):
    """POST /{name} validates the body as Input and returns Output JSON."""
    client = TestClient(build_app(echo_registry))
    response = client.post("/echo", json={"text": "hi"})
    assert response.status_code == 200
    assert response.json() == {"text": "> hi"}


def test_params_map_to_query(echo_registry):
    """Params fields are exposed as query parameters."""
    client = TestClient(build_app(echo_registry))
    response = client.post("/echo?upper=true&times=2", json={"text": "hi"})
    assert response.json() == {"text": "> HI> HI"}


def test_openapi_lists_command(echo_registry):
    """Each command appears in the generated OpenAPI schema."""
    schema = TestClient(build_app(echo_registry)).get("/openapi.json").json()
    assert "/echo" in schema["paths"]
