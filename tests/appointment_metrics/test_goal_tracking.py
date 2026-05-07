"""
Testes: Meta mensal + acompanhamento de progresso.

Regra: goal lê de appointment_goals pelo mês/ano de p_start (sem TZ shift).
       achieved = count de completed no mês/ano da meta.
       progress_pct = achieved / target * 100.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import call_metrics_rpc


def test_goal_null_when_not_configured(supa, test_owner, professional_id, seed):
    """Sem meta configurada → goal=null."""
    seed.appointment(
        test_owner, professional_id,
        start_time=datetime(2029, 11, 5, 13, 0, tzinfo=timezone.utc),
        status="completed",
    )
    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2029, 11, 1, tzinfo=timezone.utc),
        datetime(2029, 11, 30, tzinfo=timezone.utc),
    )
    assert metrics["goal"] is None


def test_goal_progress_calculated(supa, test_owner, professional_id, seed):
    """Meta=10, completed=3 → progress_pct=30."""
    seed.goal(test_owner, month=12, year=2029, target=10)
    base = datetime(2029, 12, 5, 13, 0, tzinfo=timezone.utc)
    for i in range(3):
        seed.appointment(test_owner, professional_id,
                         start_time=base + timedelta(days=i), status="completed")

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2029, 12, 1, tzinfo=timezone.utc),
        datetime(2029, 12, 31, tzinfo=timezone.utc),
    )
    assert metrics["goal"] is not None
    assert metrics["goal"]["target"] == 10
    assert metrics["goal"]["achieved"] == 3
    assert metrics["goal"]["progress_pct"] == 30.0
    assert metrics["goal"]["month"] == 12
    assert metrics["goal"]["year"] == 2029


def test_goal_only_counts_completed(supa, test_owner, professional_id, seed):
    """achieved ignora pending/canceled/rescheduled/confirmed. Apenas completed."""
    seed.goal(test_owner, month=1, year=2030, target=5)
    base = datetime(2030, 1, 10, 13, 0, tzinfo=timezone.utc)
    # 2 completed (contam)
    for i in range(2):
        seed.appointment(test_owner, professional_id,
                         start_time=base + timedelta(days=i), status="completed")
    # 3 outros status (NÃO contam)
    for status in ("pending", "confirmed", "canceled"):
        seed.appointment(test_owner, professional_id,
                         start_time=base + timedelta(days=5, hours=hash(status) % 10),
                         status=status)

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2030, 1, 1, tzinfo=timezone.utc),
        datetime(2030, 1, 31, tzinfo=timezone.utc),
    )
    assert metrics["goal"]["achieved"] == 2
    assert metrics["goal"]["progress_pct"] == 40.0


def test_goal_over_100_percent(supa, test_owner, professional_id, seed):
    """Se ultrapassar meta, progress_pct > 100 (não faz cap no SQL)."""
    seed.goal(test_owner, month=2, year=2030, target=2)
    base = datetime(2030, 2, 5, 13, 0, tzinfo=timezone.utc)
    for i in range(5):
        seed.appointment(test_owner, professional_id,
                         start_time=base + timedelta(days=i), status="completed")

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2030, 2, 1, tzinfo=timezone.utc),
        datetime(2030, 2, 28, tzinfo=timezone.utc),
    )
    assert metrics["goal"]["target"] == 2
    assert metrics["goal"]["achieved"] == 5
    assert metrics["goal"]["progress_pct"] == 250.0
