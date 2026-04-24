"""
Testes: Métrica "Tempo da 1ª Resposta" (IA vs Humano).

Valida que:
- first_response_at, first_response_by_ai e first_response_duration_seconds
  são populados corretamente pelo trigger trg_update_conversation_metrics
- A RPC retorna a média separada para IA e Humano
- Respostas subsequentes NÃO sobrescrevem a primeira
- Conversas sem resposta NÃO entram na média
- Outliers > 24h são excluídos da média
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import call_metrics_rpc


def test_first_response_by_ai_populates_correctly(supa, test_owner, seed):
    """IA responde 30s após mensagem do cliente → duration=30s, by_ai=true."""
    now = datetime.now(timezone.utc)
    conv_start = now - timedelta(days=1)
    conv = seed.conversation(test_owner, created_at=conv_start)

    customer_msg_ts = conv_start + timedelta(seconds=10)
    seed.message(
        conv["id"], direction="inbound",
        created_at=customer_msg_ts, user_id=test_owner,
    )

    ai_response_ts = customer_msg_ts + timedelta(seconds=30)
    seed.message(
        conv["id"], direction="outbound",
        is_ai_response=True, created_at=ai_response_ts, user_id=test_owner,
    )

    updated = supa.table("conversations").select("*").eq(
        "id", conv["id"]
    ).single().execute().data

    assert updated["first_response_at"] is not None
    assert updated["first_response_by_ai"] is True
    assert updated["first_response_duration_seconds"] == 30


def test_first_response_by_human_populates_correctly(supa, test_owner, seed):
    """Humano responde 120s após mensagem → duration=120s, by_ai=false."""
    now = datetime.now(timezone.utc)
    conv_start = now - timedelta(days=1)
    conv = seed.conversation(test_owner, created_at=conv_start)

    customer_msg_ts = conv_start + timedelta(seconds=5)
    seed.message(conv["id"], direction="inbound",
                 created_at=customer_msg_ts, user_id=test_owner)

    human_response_ts = customer_msg_ts + timedelta(seconds=120)
    seed.message(conv["id"], direction="outbound", is_ai_response=False,
                 created_at=human_response_ts, user_id=test_owner)

    updated = supa.table("conversations").select("*").eq(
        "id", conv["id"]
    ).single().execute().data

    assert updated["first_response_by_ai"] is False
    assert updated["first_response_duration_seconds"] == 120


def test_subsequent_responses_do_not_overwrite_first(supa, test_owner, seed):
    """Respostas subsequentes NÃO devem sobrescrever first_response."""
    now = datetime.now(timezone.utc)
    conv_start = now - timedelta(days=1)
    conv = seed.conversation(test_owner, created_at=conv_start)

    customer_ts = conv_start + timedelta(seconds=0)
    seed.message(conv["id"], direction="inbound",
                 created_at=customer_ts, user_id=test_owner)

    first_ts = customer_ts + timedelta(seconds=20)
    seed.message(conv["id"], direction="outbound", is_ai_response=True,
                 created_at=first_ts, user_id=test_owner)

    second_ts = first_ts + timedelta(seconds=300)
    seed.message(conv["id"], direction="outbound", is_ai_response=False,
                 created_at=second_ts, user_id=test_owner)

    updated = supa.table("conversations").select("*").eq(
        "id", conv["id"]
    ).single().execute().data

    assert updated["first_response_by_ai"] is True
    assert updated["first_response_duration_seconds"] == 20


def test_rpc_returns_correct_averages(supa, test_owner, seed):
    """RPC agrega média separada para IA e Humano — usa janela isolada de teste."""
    # Janela de teste no futuro (2030+) para não colidir com dados reais
    base = datetime(2030, 1, 15, 12, 0, tzinfo=timezone.utc)

    # Conv 1: IA em 30s
    c1 = seed.conversation(test_owner, created_at=base)
    t1 = base + timedelta(seconds=5)
    seed.message(c1["id"], direction="inbound", created_at=t1, user_id=test_owner)
    seed.message(c1["id"], direction="outbound", is_ai_response=True,
                 created_at=t1 + timedelta(seconds=30), user_id=test_owner)

    # Conv 2: IA em 60s → média IA=(30+60)/2=45
    c2 = seed.conversation(test_owner, created_at=base)
    t2 = base + timedelta(seconds=5)
    seed.message(c2["id"], direction="inbound", created_at=t2, user_id=test_owner)
    seed.message(c2["id"], direction="outbound", is_ai_response=True,
                 created_at=t2 + timedelta(seconds=60), user_id=test_owner)

    # Conv 3: Humano 200s → média Humano=200
    c3 = seed.conversation(test_owner, created_at=base)
    t3 = base + timedelta(seconds=5)
    seed.message(c3["id"], direction="inbound", created_at=t3, user_id=test_owner)
    seed.message(c3["id"], direction="outbound", is_ai_response=False,
                 created_at=t3 + timedelta(seconds=200), user_id=test_owner)

    start = base - timedelta(hours=1)
    end = base + timedelta(hours=1)
    metrics = call_metrics_rpc(supa, test_owner, start, end)

    assert metrics["avg_first_response_seconds_ai"] == 45
    assert metrics["avg_first_response_seconds_human"] == 200


def test_conversations_without_response_not_counted(supa, test_owner, seed):
    """Conversas sem nenhum outbound não entram na média."""
    base = datetime(2030, 2, 10, 12, 0, tzinfo=timezone.utc)

    c1 = seed.conversation(test_owner, created_at=base)
    t1 = base + timedelta(seconds=5)
    seed.message(c1["id"], direction="inbound", created_at=t1, user_id=test_owner)
    seed.message(c1["id"], direction="outbound", is_ai_response=True,
                 created_at=t1 + timedelta(seconds=50), user_id=test_owner)

    # Conv sem resposta
    c2 = seed.conversation(test_owner, created_at=base)
    seed.message(c2["id"], direction="inbound",
                 created_at=base + timedelta(seconds=5), user_id=test_owner)

    metrics = call_metrics_rpc(
        supa, test_owner,
        base - timedelta(hours=1), base + timedelta(hours=1),
    )
    assert metrics["avg_first_response_seconds_ai"] == 50


def test_outliers_above_24h_excluded(supa, test_owner, seed):
    """Respostas > 24h são excluídas (filtro da RPC)."""
    base = datetime(2030, 3, 10, 12, 0, tzinfo=timezone.utc)

    # Outlier: 25h
    c1 = seed.conversation(test_owner, created_at=base)
    t1 = base + timedelta(seconds=5)
    seed.message(c1["id"], direction="inbound", created_at=t1, user_id=test_owner)
    seed.message(c1["id"], direction="outbound", is_ai_response=False,
                 created_at=t1 + timedelta(hours=25), user_id=test_owner)

    # Dentro de 24h
    c2 = seed.conversation(test_owner, created_at=base)
    t2 = base + timedelta(seconds=5)
    seed.message(c2["id"], direction="inbound", created_at=t2, user_id=test_owner)
    seed.message(c2["id"], direction="outbound", is_ai_response=False,
                 created_at=t2 + timedelta(seconds=100), user_id=test_owner)

    metrics = call_metrics_rpc(
        supa, test_owner,
        base - timedelta(days=1), base + timedelta(days=3),
    )
    assert metrics["avg_first_response_seconds_human"] == 100
