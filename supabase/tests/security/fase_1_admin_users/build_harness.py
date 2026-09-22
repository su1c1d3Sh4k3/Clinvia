"""Monta o arnes da Fase 1: head + ANTES + migration + DEPOIS + rollback."""
import pathlib
import re

base = pathlib.Path(__file__).resolve().parents[2]
tmp = base / "supabase" / ".temp"
mig = base / "supabase" / "migrations" / "20260922230000_super_admin_via_admin_users.sql"

head = (tmp / "_f1_head.sql").read_text(encoding="utf-8")
measure = (tmp / "_f1_measure.sql").read_text(encoding="utf-8")
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
    + "\n-- Estado final dos privilegios/marcas\n"
    + "insert into _r(info) select 'DEPOIS | admin_users | linhas=' || count(*)::text"
    + " || ' super_ativos=' || count(*) filter (where is_super_admin and is_active)::text"
    + " from public.admin_users;\n"
    + tail
)
(tmp / "_f1_harness.sql").write_text(out, encoding="utf-8")
print("ok", len(out), "bytes")
