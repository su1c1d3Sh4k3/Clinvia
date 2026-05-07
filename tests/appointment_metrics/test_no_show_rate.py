"""
Testes: Taxa de No-show (não-concluídos) + breakdown cancelamentos.

Regra: no_show_rate = (total - completed) / total * 100
       canceled_rate = canceled / total * 100
       pure_no_show = not_completed - canceled
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import call_metrics_rpc


def test_all_completed_no_show_zero(supa, test_owner, professional_id, seed):
    """100% completed → no_show_rate=0."""
    base = datetime(2029, 7, 1, 13, 0, tzinfo=timezone.utc)
    for i in range(3):
        seed.appointment(
            test_owner, professional_id,
            start_time=base + timedelta(days=i), status="completed",
        )
    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2029, 7, 1, tzinfo=timezone.utc),
        datetime(2029, 7, 31, tzinfo=timezone.utc),
    )
    assert metrics["total"] == 3
    assert metrics["completed_count"] == 3
    assert metrics["no_show_rate"] == 0
    assert metrics["pure_no_show"] == 0


def test_example_from_spec(supa, test_owner, professional_id, seed):
    """Exemplo do PRD: 10 total, 7 completed, 1 canceled, 2 pending.
    no_show_rate = 30%, canceled_rate = 10%, pure_no_show = 2."""
    base = datetime(2029, 8, 1, 13, 0, tzinfo=timezone.utc)
    for i in range(7):
        seed.appointment(test_owner, professional_id,
                         start_time=base + timedelta(hours=i), status="completed")
    seed.appointment(test_owner, professional_id,
                     start_time=base + timedelta(days=1), status="canceled")
    for i in range(2):
        seed.appointment(test_owner, professional_id,
                         start_time=base + timedelta(days=2, hours=i), status="pending")

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2029, 8, 1, tzinfo=timezone.utc),
        datetime(2029, 8, 31, tzinfo=timezone.utc),
    )
    assert metrics["total"] == 10
    assert metrics["completed_count"] == 7
    assert metrics["not_completed_count"] == 3
    assert metrics["no_show_rate"] == 30.0
    assert metrics["canceled_rate"] == 10.0
    assert metrics["pure_no_show"] == 2


def test_absence_excluded_from_metrics(supa, test_owner, professional_id, seed):
    """Registros type='absence' não contam em nenhuma métrica."""
    base = datetime(2029, 9, 1, 13, 0, tzinfo=timezone.utc)
    seed.appointment(test_owner, professional_id,
                     start_time=base, status="completed")
    seed.appointment(test_owner, professional_id,
                     start_time=base + timedelta(hours=2),
                     type_="absence", status="pending")
    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2029, 9, 1, tzinfo=timezone.utc),
        datetime(2029, 9, 30, tzinfo=timezone.utc),
    )
    assert metrics["total"] == 1  # só o appointment, não a absence
    assert metrics["completed_count"] == 1


def test_all_canceled_pure_no_show_zero(supa, test_owner, professional_id, seed):
    """Se todos não-concluídos são cancelados, pure_no_show=0."""
    base = datetime(2029, 10, 1, 13, 0, tzinfo=timezone.utc)
    for i in range(3):
        seed.appointment(test_owner, professional_id,
                         start_time=base + timedelta(days=i), status="canceled")
    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2029, 10, 1, tzinfo=timezone.utc),
        datetime(2029, 10, 31, tzinfo=timezone.utc),
    )
    assert metrics["total"] == 3
    assert metrics["completed_count"] == 0
    assert metrics["canceled_rate"] == 100.0
    assert metrics["pure_no_show"] == 0
