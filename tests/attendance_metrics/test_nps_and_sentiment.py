"""
Testes: Métricas de Satisfação — NPS (cliente 1-5) + Sentiment (IA 0-10).

Usa janela futura isolada (2031+) para evitar colisão com dados reais de NPS
já presentes no banco.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import call_metrics_rpc


def test_nps_average_single_contact(supa, test_owner, seed):
    """Contato com 1 entrada NPS nota=5 → avg_nps=5.0, total=1."""
    contact = seed.contact(test_owner)
    supa.table("contacts").update({
        "nps": [{"dataPesquisa": "2031-04-20T10:00:00Z", "nota": 5,
                 "feedback": "Ótimo!"}]
    }).eq("id", contact["id"]).execute()

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2031, 4, 1, tzinfo=timezone.utc),
        datetime(2031, 4, 30, tzinfo=timezone.utc),
    )
    assert metrics["avg_nps"] == 5.0
    assert metrics["total_nps_responses"] == 1


def test_nps_multiple_entries_averaged(supa, test_owner, seed):
    """Várias entradas no período → média correta."""
    c1 = seed.contact(test_owner)
    c2 = seed.contact(test_owner)

    supa.table("contacts").update({
        "nps": [
            {"dataPesquisa": "2031-04-10T10:00:00Z", "nota": 5, "feedback": ""},
            {"dataPesquisa": "2031-04-15T10:00:00Z", "nota": 3, "feedback": ""},
        ]
    }).eq("id", c1["id"]).execute()
    supa.table("contacts").update({
        "nps": [{"dataPesquisa": "2031-04-20T10:00:00Z", "nota": 4, "feedback": ""}]
    }).eq("id", c2["id"]).execute()

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2031, 4, 1, tzinfo=timezone.utc),
        datetime(2031, 4, 30, tzinfo=timezone.utc),
    )
    assert metrics["avg_nps"] == 4.0  # (5+3+4)/3
    assert metrics["total_nps_responses"] == 3


def test_nps_entries_outside_period_excluded(supa, test_owner, seed):
    """Entradas fora do período (dataPesquisa) não entram."""
    c = seed.contact(test_owner)
    supa.table("contacts").update({
        "nps": [
            {"dataPesquisa": "2031-04-20T10:00:00Z", "nota": 5, "feedback": ""},
            {"dataPesquisa": "2031-03-10T10:00:00Z", "nota": 1, "feedback": ""},
            {"dataPesquisa": "2031-05-15T10:00:00Z", "nota": 2, "feedback": ""},
        ]
    }).eq("id", c["id"]).execute()

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2031, 4, 1, tzinfo=timezone.utc),
        datetime(2031, 4, 30, tzinfo=timezone.utc),
    )
    assert metrics["avg_nps"] == 5.0
    assert metrics["total_nps_responses"] == 1


def test_nps_text_values_mapped(supa, test_owner, seed):
    """Notas em TEXTO ('Excelente', 'Bom'...) são mapeadas para 1-5."""
    c = seed.contact(test_owner)
    supa.table("contacts").update({
        "nps": [
            {"dataPesquisa": "2031-06-01T10:00:00Z", "nota": "Excelente", "feedback": ""},
            {"dataPesquisa": "2031-06-05T10:00:00Z", "nota": "Muito Bom", "feedback": ""},
            {"dataPesquisa": "2031-06-10T10:00:00Z", "nota": "Bom", "feedback": ""},
            {"dataPesquisa": "2031-06-15T10:00:00Z", "nota": "Regular", "feedback": ""},
            {"dataPesquisa": "2031-06-20T10:00:00Z", "nota": "Ruim", "feedback": ""},
        ]
    }).eq("id", c["id"]).execute()

    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2031, 6, 1, tzinfo=timezone.utc),
        datetime(2031, 6, 30, tzinfo=timezone.utc),
    )
    # (5+4+3+2+1)/5 = 3.0
    assert metrics["avg_nps"] == 3.0
    assert metrics["total_nps_responses"] == 5


def test_sentiment_score_averaged(supa, test_owner, seed):
    """Média de conversations.sentiment_score no período."""
    base = datetime(2032, 1, 10, 12, 0, tzinfo=timezone.utc)

    c1 = seed.conversation(test_owner, created_at=base)
    supa.table("conversations").update({"sentiment_score": 8.0}).eq("id", c1["id"]).execute()
    c2 = seed.conversation(test_owner, created_at=base)
    supa.table("conversations").update({"sentiment_score": 6.0}).eq("id", c2["id"]).execute()
    c3 = seed.conversation(test_owner, created_at=base)
    supa.table("conversations").update({"sentiment_score": 10.0}).eq("id", c3["id"]).execute()

    metrics = call_metrics_rpc(
        supa, test_owner,
        base - timedelta(hours=1), base + timedelta(hours=1),
    )
    assert metrics["avg_sentiment_score"] == 8.0  # (8+6+10)/3


def test_sentiment_null_excluded_from_average(supa, test_owner, seed):
    """Conversas sem sentiment_score não entram na média."""
    base = datetime(2032, 2, 15, 12, 0, tzinfo=timezone.utc)

    c1 = seed.conversation(test_owner, created_at=base)
    supa.table("conversations").update({"sentiment_score": 5.0}).eq("id", c1["id"]).execute()
    seed.conversation(test_owner, created_at=base)  # sem sentiment

    metrics = call_metrics_rpc(
        supa, test_owner,
        base - timedelta(hours=1), base + timedelta(hours=1),
    )
    assert metrics["avg_sentiment_score"] == 5.0


def test_nps_empty_array_returns_zero(supa, test_owner, seed):
    """Janela sem NPS → avg=0, total=0."""
    seed.contact(test_owner)  # sem nps
    metrics = call_metrics_rpc(
        supa, test_owner,
        datetime(2036, 1, 1, tzinfo=timezone.utc),
        datetime(2036, 1, 31, tzinfo=timezone.utc),
    )
    assert metrics["avg_nps"] == 0
    assert metrics["total_nps_responses"] == 0
