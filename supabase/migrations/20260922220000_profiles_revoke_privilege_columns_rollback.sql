-- Rollback de 20260922220000_profiles_revoke_privilege_columns.sql
-- Devolve o UPDATE de TABELA em public.profiles para authenticated e anon,
-- exatamente como estava antes (information_schema.role_table_grants trazia
-- DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE para os dois roles).
--
-- ATENCAO: aplicar isto REABRE o escalonamento para super-admin.

begin;

set local lock_timeout = '5s';

-- Limpa os grants de coluna antes de devolver o grant de tabela, para nao
-- deixar privilegio duplicado no catalogo.
revoke update on public.profiles from authenticated, anon;

grant update on public.profiles to authenticated, anon;

commit;
