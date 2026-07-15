"""Unit tests for the check command service pings."""

import httpx
import pytest

from trendly.commands import check


@pytest.mark.parametrize("down, expected_ok", [(set(), True), ({"taggly"}, False)])
def test_check_reports_service_status(monkeypatch, down, expected_ok):
    """Services that refuse connections report down and flip the ok flag."""
    urls = {"searxng": "http://searx.test", "taggly": "http://taggly.test", "llm": "http://llm.test"}
    monkeypatch.setattr(check, "services", lambda: {k: {"url": v} for k, v in urls.items()})

    def fake_get(url, timeout):
        if url in {urls[name] for name in down}:
            raise httpx.ConnectError("refused")
        return httpx.Response(200)

    monkeypatch.setattr(httpx, "get", fake_get)
    result = check.CheckCommand()()
    assert result.ok is expected_ok
    assert {name for name, status in result.services.items() if status == "down"} == down
