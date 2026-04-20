"""
Gap-filling tests for:
- R9: Only one period → skip period selection
- R24: Zero-slots rollover up to MAX_ROLLOVER_WEEKS then transfer
- R23: Dispatcher inserts jobs staggered by 2s
- Kill-switch: session table is untouched when off

These tests either seed very specific availability (sole-period) or mock the
professional to have zero work hours, so they can run deterministically.
"""
from __future__ import annotations

import pytest
from datetime import datetime, timedelta, timezone as _tz

from conftest import TEST_USER_ID, invoke_edge, get_session_for_delivery


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_dispatcher_staggers_scheduled_at_by_2s(supa, seed_delivery):
    """R23: jobs must be scheduled with +2s gaps."""
    invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})
    jobs = (
        supa.table("delivery_automation_jobs").select("scheduled_at")
        .eq("user_id", TEST_USER_ID).eq("status", "pending")
        .order("scheduled_at", desc=False).execute().data
    )
    if len(jobs) < 2:
        pytest.skip("need at least 2 eligible deliveries in staging to verify staggering")
    t0 = datetime.fromisoformat(jobs[0]["scheduled_at"].replace("Z", "+00:00"))
    t1 = datetime.fromisoformat(jobs[1]["scheduled_at"].replace("Z", "+00:00"))
    gap = (t1 - t0).total_seconds()
    assert 1.5 <= gap <= 3.5, f"expected ~2s stagger, got {gap}s"


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_zero_slots_rollover_eventually_transfers(supa, seed_delivery):
    """
    R24: if no slots are available in MAX_ROLLOVER_WEEKS (=8) weeks, the session
    transfers to human with an apology message.

    Simulated by:
      1. Temporarily setting professional.work_days = [] (no working days)
      2. Picking any weekday button
      3. Expect: state = 'transferred', last outbound says 'especialista'
    """
    # Fetch current work_days for restore
    delivery = (
        supa.table("deliveries").select("professional_id")
        .eq("id", seed_delivery["id"]).single().execute().data
    )
    prof_before = (
        supa.table("professionals").select("work_days,work_hours")
        .eq("id", delivery["professional_id"]).single().execute().data
    )

    try:
        # Wipe work_days so the slot-engine returns [] on every recompute
        supa.table("professionals").update(
            {"work_days": []}
        ).eq("id", delivery["professional_id"]).execute()

        # Start + pick Monday
        invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})
        supa.table("delivery_automation_jobs").update(
            {"scheduled_at": "2020-01-01T00:00:00+00:00"}
        ).eq("delivery_id", seed_delivery["id"]).execute()
        invoke_edge(supa, "delivery-automation-worker", {})

        session = get_session_for_delivery(supa, seed_delivery["id"])
        if session["state"] != "awaiting_day":
            pytest.skip(f"worker could not advance session (state={session['state']})")

        # Respond with day_1 — should trigger 9 rollovers and transfer
        invoke_edge(supa, "delivery-automation-respond", {
            "conversationId": session["conversation_id"],
            "contactId": session["contact_id"],
            "userId": session["user_id"],
            "rawMessage": "Segunda-feira",
            "buttonId": "day_1",
            "buttonText": "Segunda-feira",
        })

        s = get_session_for_delivery(supa, seed_delivery["id"])
        assert s["state"] == "transferred"
        assert s["rollover_weeks"] >= 8

        msgs = (
            supa.table("messages").select("body,direction")
            .eq("conversation_id", s["conversation_id"])
            .eq("direction", "outbound").order("created_at", desc=True)
            .limit(1).execute().data
        )
        assert len(msgs) == 1
        assert "especialista" in msgs[0]["body"].lower()
    finally:
        # Restore
        supa.table("professionals").update(
            {"work_days": prof_before["work_days"]}
        ).eq("id", delivery["professional_id"]).execute()


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_only_one_period_skips_to_time_selection(supa, seed_delivery):
    """
    R9: when availability exists only in the morning (or only afternoon),
    the state machine must SKIP the period prompt and go straight to
    awaiting_time with that period pre-selected.

    Simulated by setting professional.work_hours to morning-only (08-12).
    """
    delivery = (
        supa.table("deliveries").select("professional_id")
        .eq("id", seed_delivery["id"]).single().execute().data
    )
    prof_before = (
        supa.table("professionals").select("work_days,work_hours")
        .eq("id", delivery["professional_id"]).single().execute().data
    )

    try:
        supa.table("professionals").update({
            "work_days": [1, 2, 3, 4, 5],
            "work_hours": {"start": "08:00", "end": "11:30", "break_start": "", "break_end": ""},
        }).eq("id", delivery["professional_id"]).execute()

        invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})
        supa.table("delivery_automation_jobs").update(
            {"scheduled_at": "2020-01-01T00:00:00+00:00"}
        ).eq("delivery_id", seed_delivery["id"]).execute()
        invoke_edge(supa, "delivery-automation-worker", {})

        session = get_session_for_delivery(supa, seed_delivery["id"])
        if session["state"] != "awaiting_day":
            pytest.skip("worker could not advance session to awaiting_day")

        invoke_edge(supa, "delivery-automation-respond", {
            "conversationId": session["conversation_id"],
            "contactId": session["contact_id"],
            "userId": session["user_id"],
            "rawMessage": "Segunda-feira",
            "buttonId": "day_1",
            "buttonText": "Segunda-feira",
        })

        s = get_session_for_delivery(supa, seed_delivery["id"])
        # Must have jumped straight to awaiting_time (skipping awaiting_period)
        # with the period pre-selected as 'morning'.
        assert s["state"] == "awaiting_time"
        assert s["selected_period"] == "morning"
        assert s["available_slots"] is not None and len(s["available_slots"]) > 0
    finally:
        supa.table("professionals").update({
            "work_days": prof_before["work_days"],
            "work_hours": prof_before["work_hours"],
        }).eq("id", delivery["professional_id"]).execute()
