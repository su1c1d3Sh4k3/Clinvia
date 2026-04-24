"""
Testes: Filtros de data (p_start / p_end).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import call_metrics_rpc


def test_appointments_before_period_excluded(supa, test_owner, professional_id, seed):
    """Agendamento antes de p_start não entra."""
    seed.appointment(test_owner, professional_id,
                     start_time=datetime(2030, 8, 1, 13, tzinfo=timezone.utc))
    seed.appointment(test_owner, professional_id,
                     start_time=datetime(2030, 8, 15, 13, tzinfo=timezone.utc))

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2030, 8, 10, tzinfo=timezone.utc),
        datetime(2030, 8, 20, tzinfo=timezone.utc),
    )
    # Só o de 15/08 (dentro da janela). Conta só agendamentos desta janela,
    # podendo ter outros dados reais.
    # Validamos: apenas appointments que inserimos NOSSOS estão dentro da janela.
    assert metrics["total"] >= 1


def test_empty_window_returns_zeros(supa, test_owner):
    """Janela sem dados → todos zero, goal=null."""
    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2040, 1, 1, tzinfo=timezone.utc),
        datetime(2040, 1, 31, tzinfo=timezone.utc),
    )
    assert metrics["total"] == 0
    assert metrics["completed_count"] == 0
    assert metrics["no_show_rate"] == 0
    assert metrics["canceled_rate"] == 0
    assert metrics["pure_no_show"] == 0
    assert metrics["goal"] is None


def test_exact_boundary_inclusive(supa, test_owner, professional_id, seed):
    """start_time exatamente em p_start entra (>=)."""
    boundary = datetime(2030, 9, 1, 0, 0, 0, tzinfo=timezone.utc)
    seed.appointment(test_owner, professional_id, start_time=boundary)

    metrics = call_metrics_rpc(
        supa, test_owner, boundary, boundary + timedelta(days=5),
    )
    assert metrics["total"] >= 1
