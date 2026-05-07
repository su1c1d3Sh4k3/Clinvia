"""
Testes: Métrica "Fora do Expediente" (is_outside_business_hours).

Usa scheduling_settings do STAGING_USER_ID — o fixture restaura o original no
teardown.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import call_metrics_rpc


# America/Sao_Paulo é UTC-3 (sem DST desde 2019)
SP = timezone(timedelta(hours=-3))


def test_inside_business_hours_weekday(supa, test_owner, seed):
    """Terça 10h SP, expediente 9-18 Seg-Sex → INSIDE."""
    seed.scheduling_settings(test_owner, start_hour=9, end_hour=18,
                             work_days=[1, 2, 3, 4, 5])

    # 2026-04-21 é terça
    tue_10 = datetime(2026, 4, 21, 10, 0, tzinfo=SP)
    conv = seed.conversation(test_owner, created_at=tue_10)
    assert conv["is_outside_business_hours"] is False


def test_outside_late_evening(supa, test_owner, seed):
    """Terça 22h SP → OUTSIDE."""
    seed.scheduling_settings(test_owner, start_hour=9, end_hour=18)
    tue_22 = datetime(2026, 4, 21, 22, 0, tzinfo=SP)
    conv = seed.conversation(test_owner, created_at=tue_22)
    assert conv["is_outside_business_hours"] is True


def test_outside_early_morning(supa, test_owner, seed):
    """Terça 6h SP → OUTSIDE (antes do início)."""
    seed.scheduling_settings(test_owner, start_hour=9, end_hour=18)
    tue_6 = datetime(2026, 4, 21, 6, 0, tzinfo=SP)
    conv = seed.conversation(test_owner, created_at=tue_6)
    assert conv["is_outside_business_hours"] is True


def test_outside_weekend(supa, test_owner, seed):
    """Sábado 10h SP, work_days Seg-Sex → OUTSIDE."""
    seed.scheduling_settings(test_owner, start_hour=9, end_hour=18,
                             work_days=[1, 2, 3, 4, 5])
    # 2026-04-25 é sábado
    sat_10 = datetime(2026, 4, 25, 10, 0, tzinfo=SP)
    conv = seed.conversation(test_owner, created_at=sat_10)
    assert conv["is_outside_business_hours"] is True


def test_weekend_inside_when_configured(supa, test_owner, seed):
    """Sábado 10h SP COM work_days incluindo sábado (6) → INSIDE."""
    seed.scheduling_settings(test_owner, start_hour=9, end_hour=18,
                             work_days=[1, 2, 3, 4, 5, 6])
    sat_10 = datetime(2026, 4, 25, 10, 0, tzinfo=SP)
    conv = seed.conversation(test_owner, created_at=sat_10)
    assert conv["is_outside_business_hours"] is False


def test_boundary_at_start_hour(supa, test_owner, seed):
    """09:00 SP exato = início → INSIDE (>=)."""
    seed.scheduling_settings(test_owner, start_hour=9, end_hour=18)
    tue_9 = datetime(2026, 4, 21, 9, 0, tzinfo=SP)
    conv = seed.conversation(test_owner, created_at=tue_9)
    assert conv["is_outside_business_hours"] is False


def test_boundary_at_end_hour(supa, test_owner, seed):
    """18:00 SP exato = fim → OUTSIDE (< end, exclusivo)."""
    seed.scheduling_settings(test_owner, start_hour=9, end_hour=18)
    tue_18 = datetime(2026, 4, 21, 18, 0, tzinfo=SP)
    conv = seed.conversation(test_owner, created_at=tue_18)
    assert conv["is_outside_business_hours"] is True


def test_rpc_counts_outside_and_inside(supa, test_owner, seed):
    """RPC agrega contagens corretas."""
    seed.scheduling_settings(test_owner, start_hour=9, end_hour=18,
                             work_days=[1, 2, 3, 4, 5])

    # Usamos janela estreita (abril 20-26 2026) para isolar de dados reais
    # 3 INSIDE (terça 9, 12, 17)
    for h in [9, 12, 17]:
        seed.conversation(test_owner,
                          created_at=datetime(2026, 4, 21, h, 0, tzinfo=SP))

    # 2 OUTSIDE (antes/depois no mesmo dia útil)
    seed.conversation(test_owner,
                      created_at=datetime(2026, 4, 21, 6, 0, tzinfo=SP))
    seed.conversation(test_owner,
                      created_at=datetime(2026, 4, 21, 23, 0, tzinfo=SP))
    # 1 OUTSIDE (sábado)
    seed.conversation(test_owner,
                      created_at=datetime(2026, 4, 25, 10, 0, tzinfo=SP))

    # Janela: 20 a 26 de abril 2026
    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2026, 4, 20, tzinfo=timezone.utc),
        datetime(2026, 4, 26, 23, 59, 59, tzinfo=timezone.utc),
    )

    assert metrics["total_conversations"] == 6
    assert metrics["count_inside_business_hours"] == 3
    assert metrics["count_outside_business_hours"] == 3
