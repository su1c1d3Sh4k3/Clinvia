"""
Integration tests for delivery-automation-worker.

Verifies: pending job pickup, outbound message logged, session transitions to
awaiting_day, SKIP LOCKED prevents double-send under concurrent invocations.
"""
from __future__ import annotations

import asyncio
import time

import pytest

from conftest import TEST_USER_ID, invoke_edge, get_session_for_delivery


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_worker_processes_pending_start_job(supa, seed_delivery):
    # 1. Dispatcher creates session+job
    invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})
    session = get_session_for_delivery(supa, seed_delivery["id"])
    assert session is not None

    # 2. Force job scheduled_at to now so worker picks it up immediately
    supa.table("delivery_automation_jobs").update(
        {"scheduled_at": "2020-01-01T00:00:00+00:00"}
    ).eq("delivery_id", seed_delivery["id"]).execute()

    # 3. Worker runs
    invoke_edge(supa, "delivery-automation-worker", {})

    # 4. Assertions
    session = get_session_for_delivery(supa, seed_delivery["id"])
    assert session["state"] == "awaiting_day"
    assert session["conversation_id"] is not None
    assert session["last_prompt_message_id"] is not None

    job = (
        supa.table("delivery_automation_jobs")
        .select("*").eq("delivery_id", seed_delivery["id"]).execute().data[0]
    )
    assert job["status"] == "done"


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_worker_skip_locked_no_double_dispatch(supa, seed_delivery):
    """Two concurrent worker invocations must not double-process the same job."""
    invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})
    supa.table("delivery_automation_jobs").update(
        {"scheduled_at": "2020-01-01T00:00:00+00:00"}
    ).eq("delivery_id", seed_delivery["id"]).execute()

    # Fire two invocations concurrently via threads
    import threading
    errors: list[Exception] = []

    def _run():
        try:
            invoke_edge(supa, "delivery-automation-worker", {})
        except Exception as e:
            errors.append(e)

    t1 = threading.Thread(target=_run)
    t2 = threading.Thread(target=_run)
    t1.start(); t2.start(); t1.join(); t2.join()

    # Count outbound messages on the session's conversation
    session = get_session_for_delivery(supa, seed_delivery["id"])
    assert session is not None
    msgs = (
        supa.table("messages")
        .select("id")
        .eq("conversation_id", session["conversation_id"])
        .eq("direction", "outbound").execute().data
    )
    assert len(msgs) == 1, f"Expected 1 outbound message, got {len(msgs)}"
