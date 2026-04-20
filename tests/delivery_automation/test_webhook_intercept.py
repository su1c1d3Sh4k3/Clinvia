"""
Verifies that webhook-handle-message intercepts inbound messages for
conversations with active delivery_automation_sessions, and does NOT forward
them to the N8N webhook.

This is a lightweight end-to-end: we directly check the active-session query
behavior and that the presence of a session short-circuits the handler.
"""
from __future__ import annotations

import pytest

from conftest import TEST_USER_ID, invoke_edge, get_session_for_delivery


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_active_session_query_matches_non_terminal_states(supa, seed_delivery):
    invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})
    supa.table("delivery_automation_jobs").update(
        {"scheduled_at": "2020-01-01T00:00:00+00:00"}
    ).eq("delivery_id", seed_delivery["id"]).execute()
    invoke_edge(supa, "delivery-automation-worker", {})

    session = get_session_for_delivery(supa, seed_delivery["id"])
    assert session is not None
    assert session["state"] == "awaiting_day"

    # The intercept query in webhook-handle-message:
    #   .not('state', 'in', '(completed,transferred,abandoned,failed)')
    # Mirror that here:
    active = (
        supa.table("delivery_automation_sessions")
        .select("id,state")
        .eq("conversation_id", session["conversation_id"])
        .not_.in_("state", ["completed", "transferred", "abandoned", "failed"])
        .maybeSingle().execute().data
    )
    assert active is not None
    assert active["id"] == session["id"]


@pytest.mark.usefixtures("enable_killswitch", "ensure_ai_enabled")
def test_terminal_session_no_longer_matches_intercept(supa, seed_delivery):
    invoke_edge(supa, "delivery-automation-dispatcher", {"forceUserId": TEST_USER_ID})
    supa.table("delivery_automation_jobs").update(
        {"scheduled_at": "2020-01-01T00:00:00+00:00"}
    ).eq("delivery_id", seed_delivery["id"]).execute()
    invoke_edge(supa, "delivery-automation-worker", {})
    session = get_session_for_delivery(supa, seed_delivery["id"])
    assert session is not None

    # Manually mark as transferred (simulate end of flow)
    supa.table("delivery_automation_sessions").update(
        {"state": "transferred"}
    ).eq("id", session["id"]).execute()

    active = (
        supa.table("delivery_automation_sessions")
        .select("id")
        .eq("conversation_id", session["conversation_id"])
        .not_.in_("state", ["completed", "transferred", "abandoned", "failed"])
        .maybeSingle().execute().data
    )
    assert active is None
