"""Exercise operator probes against the real API with synthetic test-only roles."""

import importlib.util
from pathlib import Path
from urllib.error import HTTPError

from sqlalchemy import func, select

from tsh.database import db
from tsh.models import Sermon, Series, Speaker, Tag


def test_live_role_verifier_probes_preserve_the_library(app, client):
    path = Path(__file__).resolve().parents[2] / "deploy" / "verify_roles.py"
    spec = importlib.util.spec_from_file_location("operator_role_verifier", path)
    verifier = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verifier)
    tokens = {role: f"synthetic-{role}" for role in ("admin", "staff", "unassigned")}
    roles = {tokens["admin"]: "Admin", tokens["staff"]: "InternalUser", tokens["unassigned"]: "Nobody"}

    def snapshot():
        counts = [db.session.scalar(select(func.count()).select_from(model)) for model in (Sermon, Series, Speaker, Tag)]
        sermons = [
            (s.id, s.title, s.description, s.speaker_id, s.series_id, s.date)
            for s in db.session.scalars(select(Sermon).order_by(Sermon.id))
        ]
        return counts, sermons

    class Response:
        def __init__(self, status):
            self.status = status

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    class ApiOpener:
        def open(self, request, timeout):
            token = request.get_header("Authorization", "").removeprefix("Bearer ")
            response = client.open(
                request.selector, method=request.method, data=request.data,
                content_type="application/json",
                headers={"X-Test-Roles": roles.get(token, "none")},
            )
            if response.status_code >= 400:
                raise HTTPError(request.full_url, response.status_code, "synthetic", {}, None)
            return Response(response.status_code)

    before = snapshot()
    report = verifier.verify("http://localhost:5173", tokens, opener=ApiOpener())
    assert report["passed"], report["checks"]
    assert snapshot() == before
    assert not db.session.new
    assert not db.session.deleted
