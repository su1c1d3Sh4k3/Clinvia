"""
Testes: Métrica "IA vs Humano" (is_ai_handled).

Regra: is_ai_handled = true quando há PELO MENOS 1 mensagem da IA na conversa.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import call_metrics_rpc


def test_single_ai_message_marks_ai_handled(supa, test_owner, seed):
    """Uma única mensagem da IA marca is_ai_handled=true."""
    base = datetime(2030, 4, 10, 12, 0, tzinfo=timezone.utc)
    conv = seed.conversation(test_owner, created_at=base)

    seed.message(conv["id"], direction="outbound", is_ai_response=True,
                 created_at=base + timedelta(seconds=10), user_id=test_owner)

    updated = supa.table("conversations").select("is_ai_handled").eq(
        "id", conv["id"]
    ).single().execute().data
    assert updated["is_ai_handled"] is True


def test_only_human_responses_keeps_not_ai_handled(supa, test_owner, seed):
    """Só respostas humanas → is_ai_handled=false."""
    base = datetime(2030, 4, 11, 12, 0, tzinfo=timezone.utc)
    conv = seed.conversation(test_owner, created_at=base)

    for i in range(3):
        seed.message(conv["id"], direction="outbound", is_ai_response=False,
                     created_at=base + timedelta(seconds=10 + i),
                     user_id=test_owner)

    updated = supa.table("conversations").select("is_ai_handled").eq(
        "id", conv["id"]
    ).single().execute().data
    assert updated["is_ai_handled"] is False


def test_mixed_ai_and_human_is_ai_handled(supa, test_owner, seed):
    """IA + humano depois: is_ai_handled=true (pelo menos 1 IA)."""
    base = datetime(2030, 4, 12, 12, 0, tzinfo=timezone.utc)
    conv = seed.conversation(test_owner, created_at=base)

    seed.message(conv["id"], direction="outbound", is_ai_response=True,
                 created_at=base + timedelta(seconds=10), user_id=test_owner)
    seed.message(conv["id"], direction="outbound", is_ai_response=False,
                 created_at=base + timedelta(minutes=5), user_id=test_owner)

    updated = supa.table("conversations").select("is_ai_handled").eq(
        "id", conv["id"]
    ).single().execute().data
    assert updated["is_ai_handled"] is True


def test_rpc_counts_match_total(supa, test_owner, seed):
    """count_ai + count_human = total_conversations."""
    base = datetime(2030, 4, 15, 12, 0, tzinfo=timezone.utc)

    # 2 IA
    for i in range(2):
        c = seed.conversation(test_owner, created_at=base)
        seed.message(c["id"], direction="outbound", is_ai_response=True,
                     created_at=base + timedelta(minutes=i + 1),
                     user_id=test_owner)

    # 3 humanos
    for i in range(3):
        c = seed.conversation(test_owner, created_at=base)
        seed.message(c["id"], direction="outbound", is_ai_response=False,
                     created_at=base + timedelta(minutes=10 + i),
                     user_id=test_owner)

    # 1 sem outbound
    seed.conversation(test_owner, created_at=base)

    metrics = call_metrics_rpc(
        supa, test_owner,
        base - timedelta(hours=1), base + timedelta(hours=1),
    )

    assert metrics["total_conversations"] == 6
    assert metrics["count_ai_handled"] == 2
    assert metrics["count_human_handled"] == 4
    assert (
        metrics["count_ai_handled"] + metrics["count_human_handled"]
        == metrics["total_conversations"]
    )
