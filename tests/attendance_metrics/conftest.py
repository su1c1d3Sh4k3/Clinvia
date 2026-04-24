"""
Pytest fixtures para testes de métricas do Relatório de Atendimento.

IMPORTANTE: scheduling_settings.user_id tem FK para auth.users, então não podemos
usar UUIDs aleatórios. Os testes usam STAGING_USER_ID (usuário real no banco de
staging) e rastreiam IDs inseridos para cleanup preciso — nenhum dado real é
afetado.
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
    """Rastreia IDs inseridos durante o teste para cleanup preciso."""
    def __init__(self) -> None:
        self.conversation_ids: List[str] = []
        self.contact_ids: List[str] = []
        self.message_ids: List[str] = []
        self.prev_scheduling: Optional[dict] = None


@pytest.fixture
def _ledger(supa) -> Iterator[_Ledger]:
    """Ledger interno. Teardown limpa tudo o que foi inserido."""
    _requires("STAGING_USER_ID")
    owner_id = STAGING_USER_ID
    ledger = _Ledger()

    # Snapshot scheduling_settings
    try:
        res = supa.table("scheduling_settings").select("*").eq(
            "user_id", owner_id
        ).maybe_single().execute()
        if res and getattr(res, "data", None):
            ledger.prev_scheduling = res.data
    except Exception:
        pass

    yield ledger

    # Cleanup
    try:
        if ledger.conversation_ids:
            supa.table("messages").delete().in_(
                "conversation_id", ledger.conversation_ids
            ).execute()
            supa.table("conversations").delete().in_(
                "id", ledger.conversation_ids
            ).execute()
        if ledger.contact_ids:
            supa.table("contacts").delete().in_("id", ledger.contact_ids).execute()
        # Restaura scheduling_settings original (se havia)
        if ledger.prev_scheduling:
            supa.table("scheduling_settings").upsert(
                ledger.prev_scheduling, on_conflict="user_id"
            ).execute()
    except Exception as e:
        print(f"[teardown] cleanup error (non-fatal): {e}")


@pytest.fixture
def test_owner(_ledger) -> str:
    """Retorna o owner_id (STAGING_USER_ID) associado ao ledger do teste."""
    return STAGING_USER_ID


class BoundSeed:
    """Seed helpers com supa + ledger pré-vinculados — API limpa para os testes."""

    def __init__(self, supa: Client, ledger: _Ledger) -> None:
        self.supa = supa
        self.ledger = ledger

    def contact(self, owner_id: str, **overrides) -> dict:
        data = {
            "user_id": owner_id,
            "number": "test_" + uuid.uuid4().hex,
            "push_name": overrides.pop("push_name", "Test Contact"),
        }
        data.update(overrides)
        inserted = self.supa.table("contacts").insert(data).execute().data[0]
        self.ledger.contact_ids.append(inserted["id"])
        return inserted

    def scheduling_settings(
        self, owner_id: str,
        start_hour: int = 9, end_hour: int = 18,
        work_days: Optional[List[int]] = None,
    ) -> dict:
        if work_days is None:
            work_days = [1, 2, 3, 4, 5]
        data = {
            "user_id": owner_id,
            "start_hour": start_hour,
            "end_hour": end_hour,
            "work_days": work_days,
        }
        return self.supa.table("scheduling_settings").upsert(
            data, on_conflict="user_id"
        ).execute().data[0]

    def conversation(
        self, owner_id: str,
        created_at: Optional[datetime] = None,
        status: str = "open",
        **overrides,
    ) -> dict:
        data = {"user_id": owner_id, "status": status}
        data.update(overrides)
        if created_at is not None:
            data["created_at"] = created_at.astimezone(timezone.utc).isoformat()

        inserted = self.supa.table("conversations").insert(data).execute().data[0]
        self.ledger.conversation_ids.append(inserted["id"])
        return inserted

    def message(
        self, conversation_id: str,
        direction: str = "inbound",
        created_at: Optional[datetime] = None,
        is_ai_response: bool = False,
        body: str = "test message",
        user_id: Optional[str] = None,
    ) -> dict:
        data = {
            "conversation_id": conversation_id,
            "direction": direction,
            "body": body,
            "is_ai_response": is_ai_response,
        }
        if user_id:
            data["user_id"] = user_id
        if created_at is not None:
            data["created_at"] = created_at.astimezone(timezone.utc).isoformat()

        inserted = self.supa.table("messages").insert(data).execute().data[0]
        self.ledger.message_ids.append(inserted["id"])
        return inserted


@pytest.fixture
def seed(supa, _ledger) -> BoundSeed:
    """
    Factory de inserção com cleanup automático.
    Uso: seed.contact(owner_id), seed.conversation(owner_id, ...), etc.
    """
    return BoundSeed(supa, _ledger)


def call_metrics_rpc(supa: Client, owner_id: str, start: datetime, end: datetime) -> dict:
    """Chama get_attendance_metrics_for_owner (RPC com owner explícito)."""
    result = supa.rpc(
        "get_attendance_metrics_for_owner",
        {
            "p_owner": owner_id,
            "p_start": start.astimezone(timezone.utc).isoformat(),
            "p_end": end.astimezone(timezone.utc).isoformat(),
        },
    ).execute()
    return result.data
