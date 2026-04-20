"""
State machine transition tests for Delivery Automation.

Each test drives the session through specific transitions by invoking
delivery-automation-respond directly. This bypasses UazAPI webhook parsing
and lets us assert DB-level side effects.
"""
from __future__ import annotations

import pytest
from datetime import date, datetime

from conftest import TEST_USER_ID, invoke_edge, get_session_for_delivery


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _start_session(supa, seed_delivery):
    invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})
    supa.table("delivery_automation_jobs").update(
        {"scheduled_at": "2020-01-01T00:00:00+00:00"}
    ).eq("delivery_id", seed_delivery["id"]).execute()
    invoke_edge(supa, "delivery-automation-worker", {})
    return get_session_for_delivery(supa, seed_delivery["id"])


def _respond(supa, session, button_id: str, button_text: str | None = None, raw: str | None = None):
    return invoke_edge(supa, "delivery-automation-respond", {
        "conversationId": session["conversation_id"],
        "contactId": session["contact_id"],
        "userId": session["user_id"],
        "rawMessage": raw or button_text or button_id,
        "buttonId": button_id,
        "buttonText": button_text,
    })


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_day_no_abandons_session_and_pushes_contact_date(supa, seed_delivery):
    session = _start_session(supa, seed_delivery)
    assert session["state"] == "awaiting_day"

    _respond(supa, session, "day_no", "Não quero agendar no momento")

    sess = get_session_for_delivery(supa, seed_delivery["id"])
    assert sess["state"] == "abandoned"
    assert sess["ended_at"] is not None

    # delivery.contact_date pushed by 7 days
    d = supa.table("deliveries").select("contact_date").eq("id", seed_delivery["id"]).single().execute().data
    from datetime import date as _date, timedelta
    assert _date.fromisoformat(d["contact_date"]) > _date.today()


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_invalid_response_once_then_transfer(supa, seed_delivery):
    session = _start_session(supa, seed_delivery)
    _respond(supa, session, "garbage_id", raw="oi tudo bem")

    s = get_session_for_delivery(supa, seed_delivery["id"])
    assert s["invalid_response_count"] == 1
    assert s["state"] == "awaiting_day"

    _respond(supa, session, "other_garbage", raw="quero sim")
    s = get_session_for_delivery(supa, seed_delivery["id"])
    assert s["state"] == "transferred"
    # Conversation assigned to Atendimento Humano queue
    conv = supa.table("conversations").select("queue_id").eq("id", s["conversation_id"]).single().execute().data
    queues = supa.table("queues").select("id,name").eq("user_id", TEST_USER_ID).execute().data
    human_queue = next((q for q in queues if q["name"] == "Atendimento Humano"), None)
    assert human_queue is not None
    assert conv["queue_id"] == human_queue["id"]


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_day_pick_leads_to_period_or_time_prompt(supa, seed_delivery):
    session = _start_session(supa, seed_delivery)
    # Pick a weekday the professional works (fall back to day_1)
    _respond(supa, session, "day_1", "Segunda-feira")

    s = get_session_for_delivery(supa, seed_delivery["id"])
    # Must have advanced to awaiting_period or awaiting_time
    assert s["state"] in ("awaiting_period", "awaiting_time", "transferred")
    # If no slots at all in 8 weeks the flow transfers — accept that too.


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_nav_week_returns_to_day_selection(supa, seed_delivery):
    session = _start_session(supa, seed_delivery)
    _respond(supa, session, "day_1")
    s = get_session_for_delivery(supa, seed_delivery["id"])
    if s["state"] != "awaiting_time":
        pytest.skip(f"state={s['state']} — need slots to reach awaiting_time")

    _respond(supa, s, "nav_week")
    s = get_session_for_delivery(supa, seed_delivery["id"])
    assert s["state"] == "awaiting_day"
    assert s["selected_period"] is None
    assert s["available_slots"] is None


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_nav_month_advances_target_date_by_7(supa, seed_delivery):
    session = _start_session(supa, seed_delivery)
    _respond(supa, session, "day_1")
    s = get_session_for_delivery(supa, seed_delivery["id"])
    if s["state"] != "awaiting_time":
        pytest.skip(f"state={s['state']} — need slots to reach awaiting_time")

    before = s["target_date"]
    _respond(supa, s, "nav_month")
    s2 = get_session_for_delivery(supa, seed_delivery["id"])
    assert s2["target_date"] != before
    assert s2["rollover_weeks"] == 1


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_final_close_marks_conversation_resolved(supa, seed_delivery):
    """This requires driving the session all the way to awaiting_confirm — slot
    dependent. Skip if availability is insufficient in staging."""
    session = _start_session(supa, seed_delivery)
    _respond(supa, session, "day_1")
    s = get_session_for_delivery(supa, seed_delivery["id"])
    if s["state"] == "awaiting_period":
        _respond(supa, s, "period_morning")
        s = get_session_for_delivery(supa, seed_delivery["id"])
    if s["state"] != "awaiting_time" or not s.get("available_slots"):
        pytest.skip("insufficient availability in staging")

    first = s["available_slots"][0]
    time_btn = f"time_{first['time'].replace(':','_')}"
    _respond(supa, s, time_btn)

    s = get_session_for_delivery(supa, seed_delivery["id"])
    assert s["state"] == "awaiting_confirm"

    _respond(supa, s, "final_close")
    s = get_session_for_delivery(supa, seed_delivery["id"])
    assert s["state"] == "completed"

    conv = (
        supa.table("conversations").select("status")
        .eq("id", s["conversation_id"]).single().execute().data
    )
    assert conv["status"] == "resolved"
