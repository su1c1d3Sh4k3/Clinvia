"""
Pytest fixtures para testes de métricas do Relatório de Agendamentos.

Segue o mesmo padrão dos tests/attendance_metrics: usa STAGING_USER_ID
(usuário real com scheduling_settings devido à FK com auth.users) e rastreia
IDs inseridos para cleanup preciso.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Iterator, List, Optional

import pytest

try:
    from supabase import Client, create_client  # type: ignore
except Exception:
    Client = None  # type: ignore
    create_client = None  # type: ignore


STAGING_URL = os.environ.get("STAGING_SUPABASE_URL", "")
STAGING_SR_KEY = os.environ.get("STAGING_SERVICE_ROLE_KEY", "")
STAGING_USER_ID = os.environ.get("STAGING_USER_ID", "")
STAGING_PROFESSIONAL_ID = os.environ.get("STAGING_PROFESSIONAL_ID", "")


def _requires(*vars_: str) -> None:
    missing = [v for v in vars_ if not os.environ.get(v)]
    if missing:
        pytest.skip(f"Missing env vars: {', '.join(missing)}")


@pytest.fixture(scope="session")
def supa() -> Client:
    _requires("STAGING_SUPABASE_URL", "STAGING_SERVICE_ROLE_KEY")
    if create_client is None:
        pytest.skip("supabase-py não instalado (pip install supabase)")
    return create_client(STAGING_URL, STAGING_SR_KEY)


class _Ledger:
    """Rastreia IDs inseridos durante o teste."""
    def __init__(self) -> None:
        self.appointment_ids: List[str] = []
        self.goal_ids: List[str] = []


@pytest.fixture
def _ledger(supa) -> Iterator[_Ledger]:
    _requires("STAGING_USER_ID")
    ledger = _Ledger()
    yield ledger
    try:
        if ledger.appointment_ids:
            supa.table("appointments").delete().in_(
                "id", ledger.appointment_ids
            ).execute()
        if ledger.goal_ids:
            supa.table("appointment_goals").delete().in_(
                "id", ledger.goal_ids
            ).execute()
    except Exception as e:
        print(f"[teardown] cleanup error (non-fatal): {e}")


@pytest.fixture
def test_owner(_ledger) -> str:
    return STAGING_USER_ID


@pytest.fixture
def professional_id(supa) -> str:
    """Retorna um profissional existente do owner. Usa STAGING_PROFESSIONAL_ID
    se disponível, caso contrário pega o primeiro do owner."""
    if STAGING_PROFESSIONAL_ID:
        return STAGING_PROFESSIONAL_ID
    _requires("STAGING_USER_ID")
    res = supa.table("professionals").select("id").eq(
        "user_id", STAGING_USER_ID
    ).limit(1).execute()
    if not res.data:
        pytest.skip("Nenhum profissional cadastrado para o STAGING_USER_ID")
    return res.data[0]["id"]


class BoundSeed:
    def __init__(self, supa: Client, ledger: _Ledger) -> None:
        self.supa = supa
        self.ledger = ledger

    def appointment(
        self, owner_id: str, professional_id: str,
        start_time: datetime,
        duration_minutes: int = 60,
        status: str = "pending",
        type_: str = "appointment",
        price: float = 0,
    ) -> dict:
        """Cria um agendamento. start_time deve ter tzinfo."""
        end_time = start_time + timedelta(minutes=duration_minutes)
        data = {
            "user_id": owner_id,
            "professional_id": professional_id,
            "type": type_,
            "status": status,
            "start_time": start_time.astimezone(timezone.utc).isoformat(),
            "end_time": end_time.astimezone(timezone.utc).isoformat(),
            "price": price,
        }
        inserted = self.supa.table("appointments").insert(data).execute().data[0]
        self.ledger.appointment_ids.append(inserted["id"])
        return inserted

    def goal(self, owner_id: str, month: int, year: int, target: int) -> dict:
        """Cria ou atualiza meta para um mês/ano."""
        data = {
            "user_id": owner_id,
            "month": month,
            "year": year,
            "target": target,
        }
        inserted = self.supa.table("appointment_goals").upsert(
            data, on_conflict="user_id,month,year"
        ).execute().data[0]
        self.ledger.goal_ids.append(inserted["id"])
        return inserted


@pytest.fixture
def seed(supa, _ledger) -> BoundSeed:
    return BoundSeed(supa, _ledger)


def call_metrics_rpc(
    supa: Client, owner_id: str, start: datetime, end: datetime
) -> dict:
    """Chama get_appointment_metrics_for_owner (RPC com owner explícito)."""
    result = supa.rpc(
        "get_appointment_metrics_for_owner",
        {
            "p_owner": owner_id,
            "p_start": start.astimezone(timezone.utc).isoformat(),
            "p_end": end.astimezone(timezone.utc).isoformat(),
        },
    ).execute()
    return result.data
