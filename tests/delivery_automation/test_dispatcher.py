"""
Integration tests for delivery-automation-dispatcher against staging.

Prereqs: edge function deployed, env vars set (see conftest.py).
"""
from __future__ import annotations

import time

import pytest

from conftest import (
    TEST_USER_ID,
    invoke_edge,
    get_session_for_delivery,
)


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_dispatcher_creates_session_and_job(supa, seed_delivery):
    # Dispatcher runs for today — our seeded delivery has contact_date=today
    res = invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})
    assert res is not None

    # Session must exist
    session = get_session_for_delivery(supa, seed_delivery["id"])
    assert session is not None
    assert session["state"] == "pending_send"
    assert session["delivery_id"] == seed_delivery["id"]

    # Job must exist
    jobs = (
        supa.table("delivery_automation_jobs")
        .select("*").eq("delivery_id", seed_delivery["id"]).execute().data
    )
    assert len(jobs) == 1
    assert jobs[0]["status"] == "pending"
    assert jobs[0]["job_type"] == "start"


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_dispatcher_skips_delivery_with_active_session(supa, seed_delivery):
    invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})

    # Second invocation must NOT create a duplicate session or job
    invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})

    sessions = (
        supa.table("delivery_automation_sessions")
        .select("id").eq("delivery_id", seed_delivery["id"]).execute().data
    )
    assert len(sessions) == 1

    jobs = (
        supa.table("delivery_automation_jobs")
        .select("id").eq("delivery_id", seed_delivery["id"]).execute().data
    )
    assert len(jobs) == 1


def test_dispatcher_respects_killswitch(supa, seed_delivery):
    # Ensure flag is FALSE
    supa.table("delivery_automation_flags").upsert(
        {"key": "enabled", "value": False}
    ).execute()

    invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})

    # No session should be created
    session = get_session_for_delivery(supa, seed_delivery["id"])
    assert session is None

    # Restore
    supa.table("delivery_automation_flags").upsert(
        {"key": "enabled", "value": True}
    ).execute()
