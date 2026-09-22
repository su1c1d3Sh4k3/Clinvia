-- Rollback de 20260922250000_financial_access_rpc.sql
-- Devolve a escrita direta da coluna financial_access para authenticated e
-- remove o RPC.
--
-- ATENCAO: reabre a escrita da coluna com o token do navegador, cuja unica
-- trava e o `if (userRole !== 'admin') return;` do front.
-- Rodar SO se o front antigo (update direto na tabela) ainda estiver publicado.

begin;

set local lock_timeout = '5s';

grant update (financial_access) on public.profiles to authenticated;
grant insert (financial_access) on public.profiles to authenticated;

drop function if exists public.set_financial_access(boolean);

commit;
