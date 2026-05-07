"""
Testes: Padrões temporais (by_day_of_week + by_hour_heatmap).

Timezone America/Sao_Paulo (UTC-3, sem DST).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import call_metrics_rpc


SP = timezone(timedelta(hours=-3))


def test_dow_extracted_in_sao_paulo(supa, test_owner, professional_id, seed):
    """Agendamento Segunda 14h SP deve aparecer como dow=1 (Monday)."""
    # Seg 2030-05-06 (DOW=1)
    mon_14 = datetime(2030, 5, 6, 14, 0, tzinfo=SP)
    seed.appointment(test_owner, professional_id, start_time=mon_14)

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2030, 5, 1, tzinfo=timezone.utc),
        datetime(2030, 5, 31, tzinfo=timezone.utc),
    )
    dow_entry = next((d for d in metrics["by_day_of_week"] if d["dow"] == 1), None)
    assert dow_entry is not None
    assert dow_entry["count"] >= 1  # pode haver outros dados reais no mesmo dia


def test_hour_extracted_in_sao_paulo(supa, test_owner, professional_id, seed):
    """Horário 14h SP deve aparecer como hour=14 no heatmap."""
    tue_14 = datetime(2030, 6, 4, 14, 30, tzinfo=SP)  # Ter
    seed.appointment(test_owner, professional_id, start_time=tue_14)

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2030, 6, 1, tzinfo=timezone.utc),
        datetime(2030, 6, 30, tzinfo=timezone.utc),
    )
    matches = [c for c in metrics["by_hour_heatmap"]
               if c["dow"] == 2 and c["hour"] == 14]
    assert len(matches) > 0
    assert matches[0]["count"] >= 1


def test_heatmap_groups_multiple_same_slot(supa, test_owner, professional_id, seed):
    """Múltiplos agendamentos no mesmo slot (DOW+hour) são agrupados."""
    # 3 na Qua 10h SP
    base = datetime(2030, 7, 10, 10, 0, tzinfo=SP)  # Qua 2030-07-10
    for i in range(3):
        seed.appointment(test_owner, professional_id,
                         start_time=base + timedelta(minutes=i * 15))

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2030, 7, 1, tzinfo=timezone.utc),
        datetime(2030, 7, 31, tzinfo=timezone.utc),
    )
    matches = [c for c in metrics["by_hour_heatmap"]
               if c["dow"] == 3 and c["hour"] == 10]
    assert len(matches) == 1  # um único slot no JSON
    assert matches[0]["count"] >= 3
