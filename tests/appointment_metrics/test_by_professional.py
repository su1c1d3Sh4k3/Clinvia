"""
Testes: Agendamentos por profissional (by_professional).

Valida: contagem correta e ordenação decrescente.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import call_metrics_rpc


def test_single_professional_count(supa, test_owner, professional_id, seed):
    """1 profissional, 3 agendamentos → entrada única com count=3."""
    base = datetime(2030, 3, 5, 13, 0, tzinfo=timezone.utc)
    for i in range(3):
        seed.appointment(test_owner, professional_id,
                         start_time=base + timedelta(days=i))

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2030, 3, 1, tzinfo=timezone.utc),
        datetime(2030, 3, 31, tzinfo=timezone.utc),
    )
    # Pode haver múltiplos profissionais reais no staging; procura o nosso
    our_entry = next(
        (p for p in metrics["by_professional"] if p["professional_id"] == professional_id),
        None,
    )
    assert our_entry is not None
    assert our_entry["count"] == 3


def test_by_professional_sorted_desc(supa, test_owner, professional_id, seed):
    """Lista retorna ordenada por count DESC."""
    base = datetime(2030, 4, 5, 13, 0, tzinfo=timezone.utc)
    for i in range(5):
        seed.appointment(test_owner, professional_id,
                         start_time=base + timedelta(days=i))

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2030, 4, 1, tzinfo=timezone.utc),
        datetime(2030, 4, 30, tzinfo=timezone.utc),
    )
    counts = [p["count"] for p in metrics["by_professional"]]
    assert counts == sorted(counts, reverse=True)
