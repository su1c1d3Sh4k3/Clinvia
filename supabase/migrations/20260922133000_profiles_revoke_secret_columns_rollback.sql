-- Rollback de 20260922133000_profiles_revoke_secret_columns.sql
-- Devolve o SELECT de TABELA em public.profiles para authenticated e anon.
--
-- ATENCAO: reabre a leitura de openai_token / openai_api_key_id /
-- openai_service_account_id para qualquer usuario logado.

begin;

set local lock_timeout = '5s';

revoke select on public.profiles from authenticated, anon;

grant select on public.profiles to authenticated, anon;

commit;
