"""The separate browser server must never select a developer or server database."""
import pytest

from e2e.server import create_fixture_app, deny_outbound_connections, require_test_mode


@pytest.mark.parametrize("environment", [{}, {"TFH_E2E": "0"}, {"TFH_ENV": "production"}])
def test_fixture_requires_explicit_test_opt_in(environment):
    with pytest.raises(RuntimeError, match="TFH_E2E=1"):
        require_test_mode(environment)


@pytest.mark.parametrize("environment", ["production", " PROD ", "staging"])
def test_fixture_refuses_server_environments(environment):
    with pytest.raises(RuntimeError, match="never run"):
        require_test_mode({"TFH_E2E": "1", "TFH_ENV": environment})


def test_fixture_rejects_existing_database_before_loading_app(monkeypatch, tmp_path):
    monkeypatch.setenv("TFH_E2E", "1")
    monkeypatch.delenv("TFH_ENV", raising=False)
    database = tmp_path / "existing.sqlite3"
    database.write_bytes(b"do not change")
    with pytest.raises(RuntimeError, match="new absolute database"):
        create_fixture_app(database)
    assert database.read_bytes() == b"do not change"


def test_browser_fixture_has_no_outbound_network():
    with pytest.raises(RuntimeError, match="network access is disabled"):
        deny_outbound_connections(("www.googleapis.com", 443))
