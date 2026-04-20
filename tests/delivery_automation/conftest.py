"""
Pytest fixtures for Delivery Automation tests.

Each fixture that creates rows in staging tears them down in its finalizer,
so tests can be run repeatedly without polluting the DB.
"""
from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Iterator, Optional

import pytest

# Lazy import: test_timezone.py is pure and doesn't need supabase-py. Integration
# tests that do, will still fail cleanly via the _requires() gate below.
try:
    from supabase import Client, create_client  # type: ignore
except Exception:  # pragma: no cover
    Client = None  # type: ignore
    create_client = None  # type: ignore


# ---------------------------------------------------------------------------
# Env
# ---------------------------------------------------------------------------

STAGING_URL = os.environ.get("STAGING_SUPABASE_URL", "")
STAGING_SR_KEY = os.environ.get("STAGING_SERVICE_ROLE_KEY", "")

TEST_USER_ID = os.environ.get("STAGING_USER_ID", "")
TEST_INSTANCE_ID = os.environ.get("STAGING_INSTANCE_ID", "")
TEST_PROFESSIONAL_ID = os.environ.get("STAGING_PROFESSIONAL_ID", "")
TEST_SERVICE_ID = os.environ.get("STAGING_SERVICE_ID", "")
TEST_PATIENT_ID = os.environ.get("STAGING_PATIENT_ID", "")


def _requires(*vars_: str) -> None:
    missing = [v for v in vars_ if not os.environ.get(v)]
    if missing:
        pytest.skip(f"Missing env vars: {', '.join(missing)}")


@pytest.fixture(scope="session")
def supa():
    _requires("STAGING_SUPABASE_URL", "STAGING_SERVICE_ROLE_KEY")
    if create_client is None:
        pytest.skip("supabase-py not installed")
    return create_client(STAGING_URL, STAGING_SR_KEY)


# ---------------------------------------------------------------------------
# Delivery seeding
# ---------------------------------------------------------------------------

@pytest.fixture
def seed_delivery(supa) -> Iterator[dict]:
    """Create a delivery in 'aguardando_agendamento' and yield it.
    Cleans up delivery, related session and jobs afterwards.
    """
    _requires(
        "STAGING_USER_ID", "STAGING_PATIENT_ID",
        "STAGING_SERVICE_ID", "STAGING_PROFESSIONAL_ID",
    )
    today = date.today().isoformat()
    row = {
        "user_id": TEST_USER_ID,
        "patient_id": TEST_PATIENT_ID,
        "service_id": TEST_SERVICE_ID,
        "professional_id": TEST_PROFESSIONAL_ID,
        "stage": "aguardando_agendamento",
        "contact_date": today,
        "notes": "automation test seed",
    }
    inserted = supa.table("deliveries").insert(row).execute().data[0]
    yield inserted

    # Cleanup: sessions/jobs first (FK cascade will also handle this but be explicit)
    supa.table("delivery_automation_jobs").delete().eq("delivery_id", inserted["id"]).execute()
    supa.table("delivery_automation_sessions").delete().eq("delivery_id", inserted["id"]).execute()
    supa.table("deliveries").delete().eq("id", inserted["id"]).execute()


@pytest.fixture
def ensure_ai_enabled(supa) -> Iterator[bool]:
    """Ensure delivery_config.ai_enabled=TRUE for the test user and restore on teardown."""
    _requires("STAGING_USER_ID")
    # Read previous
    prev = (
        supa.table("delivery_config").select("*").eq("user_id", TEST_USER_ID).maybeSingle().execute().data
    )
    supa.table("delivery_config").upsert(
        {"user_id": TEST_USER_ID, "ai_enabled": True}
    ).execute()
    yield True
    # Restore
    if prev:
        supa.table("delivery_config").upsert(prev).execute()
    else:
        supa.table("delivery_config").delete().eq("user_id", TEST_USER_ID).execute()


@pytest.fixture
def enable_killswitch(supa) -> Iterator[bool]:
    """Ensure delivery_automation_flags.enabled=TRUE, restore afterwards."""
    prev = (
        supa.table("delivery_automation_flags").select("value")
        .eq("key", "enabled").maybeSingle().execute().data
    )
    supa.table("delivery_automation_flags").upsert(
        {"key": "enabled", "value": True}
    ).execute()
    yield True
    if prev is not None:
        supa.table("delivery_automation_flags").upsert(
            {"key": "enabled", "value": bool(prev["value"])}
        ).execute()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def invoke_edge(supa, name: str, body: Optional[dict] = None):
    """Invoke an edge function via service-role Supabase HTTP."""
    return supa.functions.invoke(name, invoke_options={"body": body or {}})


def get_session_for_delivery(supa, delivery_id: str):
    res = (
        supa.table("delivery_automation_sessions")
        .select("*").eq("delivery_id", delivery_id)
        .maybeSingle().execute()
    )
    return res.data
