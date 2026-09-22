"""Monta o arnes do item 3: head + ANTES + migration + DEPOIS + rollback."""
import pathlib
import re

base = pathlib.Path(__file__).resolve().parents[2]
tmp = base / "supabase" / ".temp"
mig = base / "supabase" / "migrations" / "20260922240000_profiles_lock_insert_delete.sql"

head = (tmp / "_f06_head.sql").read_text(encoding="utf-8")
measure = (tmp / "_f06_measure.sql").read_text(encoding="utf-8")
body = mig.read_text(encoding="utf-8")

body = re.sub(r"(?im)^\s*begin;\s*$", "", body)
body = re.sub(r"(?im)^\s*commit;\s*$", "", body)
body = re.sub(r"(?im)^\s*set local lock_timeout.*$", "", body)

grants = (
    "insert into _r(info) select 'DEPOIS | GRANT TABELA | ' || grantee || ' | '"
    " || string_agg(distinct privilege_type, ',' order by privilege_type)"
    " from information_schema.role_table_grants"
    " where table_schema = 'public' and table_name = 'profiles'"
    " and grantee in ('anon','authenticated') group by grantee;\n"
    "insert into _r(info) select 'DEPOIS | GRANT INSERT COLUNA | ' || grantee || ' | '"
    " || count(*)::text || ' colunas'"
    " from information_schema.column_privileges"
    " where table_schema = 'public' and table_name = 'profiles'"
    " and grantee in ('anon','authenticated') and privilege_type = 'INSERT'"
    " group by grantee;\n"
)

tail = "\nreset role;\nselect info from _r order by ord;\n\nrollback;\n"

out = (
    head
    + measure.replace("@FASE@", "ANTES")
    + "\n\nreset role;\n-- ===== APPLY DA MIGRATION (na mesma transacao) =====\n"
    + body
    + measure.replace("@FASE@", "DEPOIS")
    + "\n-- Estado final dos privilegios\n"
    + grants
    + tail
)
(tmp / "_f06_harness.sql").write_text(out, encoding="utf-8")
print("ok", len(out), "bytes")
