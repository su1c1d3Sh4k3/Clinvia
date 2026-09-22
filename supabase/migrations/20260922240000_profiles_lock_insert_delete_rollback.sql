-- Rollback de 20260922240000_profiles_lock_insert_delete.sql
-- Devolve DELETE e INSERT de TABELA em public.profiles para authenticated e anon.
--
-- ATENCAO: reabre o contorno DELETE + INSERT que recria a propria linha com
-- role = 'super-admin'.

begin;

set local lock_timeout = '5s';

revoke insert on public.profiles from authenticated, anon;

grant delete, insert on public.profiles to authenticated, anon;

commit;
