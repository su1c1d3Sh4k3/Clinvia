"""
Testes: Filtros de data (p_start / p_end) na RPC.

Usa janelas futuras isoladas (2033+) para não colidir com dados reais.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import call_metrics_rpc


def test_conversations_before_period_excluded(supa, test_owner, seed):
    """Conversa criada ANTES de p_start não entra."""
    seed.conversation(test_owner,
                      created_at=datetime(2033, 4, 1, 12, tzinfo=timezone.utc))
    seed.conversation(test_owner,
                      created_at=datetime(2033, 4, 15, 12, tzinfo=timezone.utc))

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2033, 4, 10, tzinfo=timezone.utc),
        datetime(2033, 4, 20, tzinfo=timezone.utc),
    )
    assert metrics["total_conversations"] == 1


def test_conversations_after_period_excluded(supa, test_owner, seed):
    """Conversa criada DEPOIS de p_end não entra."""
    seed.conversation(test_owner,
                      created_at=datetime(2033, 5, 15, 12, tzinfo=timezone.utc))
    seed.conversation(test_owner,
                      created_at=datetime(2033, 5, 25, 12, tzinfo=timezone.utc))

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2033, 5, 10, tzinfo=timezone.utc),
        datetime(2033, 5, 20, tzinfo=timezone.utc),
    )
    assert metrics["total_conversations"] == 1


def test_exact_start_boundary_inclusive(supa, test_owner, seed):
    """Conversa EXATAMENTE em p_start entra (>=)."""
    boundary = datetime(2033, 6, 10, 0, 0, 0, tzinfo=timezone.utc)
    seed.conversation(test_owner, created_at=boundary)

    metrics = call_metrics_rpc(
        supa, test_owner,
        boundary, boundary + timedelta(days=5),
    )
    assert metrics["total_conversations"] == 1


def test_exact_end_boundary_inclusive(supa, test_owner, seed):
    """Conversa EXATAMENTE em p_end entra (<=)."""
    end = datetime(2033, 7, 20, 0, 0, 0, tzinfo=timezone.utc)
    seed.conversation(test_owner, created_at=end)

    metrics = call_metrics_rpc(
        supa, test_owner,
        end - timedelta(days=5), end,
    )
    assert metrics["total_conversations"] == 1


def test_narrow_window_filters_aggregates(supa, test_owner, seed):
    """Janela estreita reduz contadores consistentemente."""
    for day in [5, 15, 25]:
        c = seed.conversation(test_owner,
                              created_at=datetime(2033, 8, day, 12, tzinfo=timezone.utc))
        seed.message(c["id"], direction="outbound", is_ai_response=True,
                     created_at=datetime(2033, 8, day, 12, 1, tzinfo=timezone.utc),
                     user_id=test_owner)

    big = call_metrics_rpc(
        supa, test_owner,
        datetime(2033, 8, 1, tzinfo=timezone.utc),
        datetime(2033, 8, 31, tzinfo=timezone.utc),
    )
    assert big["total_conversations"] == 3
    assert big["count_ai_handled"] == 3

    narrow = call_metrics_rpc(
        supa, test_owner,
        datetime(2033, 8, 10, tzinfo=timezone.utc),
        datetime(2033, 8, 20, tzinfo=timezone.utc),
    )
    assert narrow["total_conversations"] == 1
    assert narrow["count_ai_handled"] == 1


def test_empty_window_returns_zeroes(supa, test_owner, seed):
    """Janela sem dados → todos zero."""
    seed.conversation(test_owner,
                      created_at=datetime(2033, 9, 15, tzinfo=timezone.utc))
    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2033, 10, 1, tzinfo=timezone.utc),
        datetime(2033, 10, 10, tzinfo=timezone.utc),
    )
    assert metrics["total_conversations"] == 0
    assert metrics["count_ai_handled"] == 0
    assert metrics["count_human_handled"] == 0
    assert metrics["avg_first_response_seconds_ai"] == 0
    assert metrics["abandonment_rate"] == 0
