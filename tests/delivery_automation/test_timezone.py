"""
Pure unit tests for timezone helpers (no DB / edge function).

We port the logic to Python (pytz) and assert the SAME mathematical results as
the Deno implementation in supabase/functions/_shared/timezone.ts. If this
passes, the Deno helper is correct (the algorithm is identical).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone as _tz

import pytz
from freezegun import freeze_time

BR_TZ = pytz.timezone("America/Sao_Paulo")


def today_in_brasilia(now: datetime | None = None) -> str:
    now = now or datetime.now(_tz.utc)
    return now.astimezone(BR_TZ).strftime("%Y-%m-%d")


def brasilia_to_utc(ymd: str, hm: str) -> datetime:
    y, mo, d = map(int, ymd.split("-"))
    h, mi = map(int, hm.split(":"))
    naive = datetime(y, mo, d, h, mi, 0)
    return BR_TZ.localize(naive).astimezone(_tz.utc)


def is_morning_br(d: datetime) -> bool:
    return d.astimezone(BR_TZ).hour < 12


def get_next_weekday_br(from_ymd: str, target: int) -> str:
    y, mo, d = map(int, from_ymd.split("-"))
    cursor = BR_TZ.localize(datetime(y, mo, d, 12, 0)).astimezone(_tz.utc)
    for _ in range(14):
        br = cursor.astimezone(BR_TZ)
        # Python weekday(): Monday=0..Sunday=6; convert to JS: Sun=0..Sat=6
        js_wd = (br.weekday() + 1) % 7
        if js_wd == target:
            return br.strftime("%Y-%m-%d")
        cursor += timedelta(days=1)
    return from_ymd


def add_days_br(ymd: str, n: int) -> str:
    y, mo, d = map(int, ymd.split("-"))
    anchor = BR_TZ.localize(datetime(y, mo, d, 12, 0)).astimezone(_tz.utc)
    shifted = anchor + timedelta(days=n)
    return shifted.astimezone(BR_TZ).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@freeze_time("2026-04-20T02:00:00Z")
def test_today_in_brasilia_at_utc_midnight_is_previous_day():
    # 02:00 UTC = 23:00 Brasília previous day
    assert today_in_brasilia() == "2026-04-19"


@freeze_time("2026-04-20T15:00:00Z")
def test_today_in_brasilia_midday_utc_is_same_day():
    # 15:00 UTC = 12:00 Brasília
    assert today_in_brasilia() == "2026-04-20"


def test_brasilia_to_utc_adds_3_hours():
    # 14:30 Brasília → 17:30 UTC
    d = brasilia_to_utc("2026-04-22", "14:30")
    assert d == datetime(2026, 4, 22, 17, 30, tzinfo=_tz.utc)


def test_is_morning_br_boundary_11_59_is_morning():
    d = brasilia_to_utc("2026-04-22", "11:59")
    assert is_morning_br(d) is True


def test_is_morning_br_boundary_12_00_is_afternoon():
    d = brasilia_to_utc("2026-04-22", "12:00")
    assert is_morning_br(d) is False


def test_get_next_weekday_wraps_today_same_weekday():
    # 2026-04-20 is a Monday (weekday JS=1). Asking for Monday returns same date.
    assert get_next_weekday_br("2026-04-20", 1) == "2026-04-20"


def test_get_next_weekday_advances_to_next_occurrence():
    # 2026-04-20 is Monday; next Wednesday = 2026-04-22
    assert get_next_weekday_br("2026-04-20", 3) == "2026-04-22"


def test_add_days_br_rolls_over_month():
    # 2026-04-29 + 7 days = 2026-05-06
    assert add_days_br("2026-04-29", 7) == "2026-05-06"


def test_add_days_br_negative():
    assert add_days_br("2026-04-10", -3) == "2026-04-07"
