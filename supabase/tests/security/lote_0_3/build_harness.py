"""Monta o arnes do lote 0.3: head + ANTES + migration + DEPOIS + rollback.

A migration entra SEM o begin/commit dela (o arnes e uma transacao unica que
termina em rollback).
"""
import pathlib
import re

base = pathlib.Path(__file__).resolve().parents[2]
tmp = base / "supabase" / ".temp"
mig = base / "supabase" / "migrations" / "20260922210000_lote_0_3_rls.sql"

head = (tmp / "_l03_head.sql").read_text(encoding="utf-8")
measure = (tmp / "_l03_measure.sql").read_text(encoding="utf-8")
body = mig.read_text(encoding="utf-8")

body = re.sub(r"(?im)^\s*begin;\s*$", "", body)
body = re.sub(r"(?im)^\s*commit;\s*$", "", body)
body = re.sub(r"(?im)^\s*set local lock_timeout.*$", "", body)

tail = "\nreset role;\nselect info from _r order by ord;\n\nrollback;\n"

out = (
    head
    + measure.replace("@FASE@", "ANTES")
    + "\n\nreset role;\n-- ===== APPLY DA MIGRATION (na mesma transacao) =====\n"
    + body
    + measure.replace("@FASE@", "DEPOIS")
    + tail
)
(tmp / "_l03_harness.sql").write_text(out, encoding="utf-8")
print("ok", len(out), "bytes")
