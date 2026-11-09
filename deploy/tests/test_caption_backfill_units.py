"""Verify the real timer clock and bounded production command without API calls."""

import configparser
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import shlex
import shutil
import subprocess
from zoneinfo import ZoneInfo

import pytest


DEPLOY = Path(__file__).resolve().parents[1]


def read_unit(name):
    unit = configparser.ConfigParser(interpolation=None, strict=False)
    unit.optionxform = str
    unit.read(DEPLOY / name, encoding="utf-8")
    return unit


@pytest.mark.parametrize(
    "day", ["2026-01-15", "2026-07-15", "2026-03-07", "2026-03-08"]
)
def test_timer_follows_pacific_midnight_in_winter_summer_and_dst_transition(day):
    analyze = shutil.which("systemd-analyze")
    if not analyze:
        pytest.skip("The systemd calendar parser is available on Linux CI")
    timer = read_unit("tfh-staging-caption-backfill.timer")["Timer"]
    # Noon UTC is already after that day's Pacific midnight. Parse the next day.
    result = subprocess.run(
        [
            analyze,
            "calendar",
            "--iterations=1",
            f"--base-time={day} 12:00:00 UTC",
            timer["OnCalendar"],
        ],
        env={**os.environ, "TZ": "UTC", "LC_ALL": "C"},
        capture_output=True,
        text=True,
        check=True,
        timeout=10,
    )
    next_day = datetime.fromisoformat(day).date() + timedelta(days=1)
    expected = datetime.combine(
        next_day, datetime.min.time(), ZoneInfo("America/Los_Angeles")
    )
    expected = (expected + timedelta(minutes=10)).astimezone(timezone.utc)
    assert expected.strftime("%Y-%m-%d %H:%M:%S UTC") in result.stdout


def test_timer_invokes_one_bounded_production_batch_without_failed_only():
    service = read_unit("tfh-staging-caption-backfill.service")["Service"]
    command = shlex.split(service["ExecStart"])
    assert command == [
        "/opt/tfh-staging/current/Backend/.venv/bin/python",
        "-m",
        "flask",
        "--app",
        "tsh.production:create_production_app()",
        "backfill-captions",
        "--limit",
        "40",
    ]
    assert service["Type"] == "oneshot"
    assert service.get("Restart", "no") == "no"
    assert service["User"] == service["Group"] == "tfh-staging"
    assert service["EnvironmentFile"] == "/etc/tfh-staging/.env"
    timer = read_unit("tfh-staging-caption-backfill.timer")["Timer"]
    assert timer["Unit"] == "tfh-staging-caption-backfill.service"
    assert timer["RandomizedDelaySec"] == "15m"
    assert timer.getboolean("Persistent")
