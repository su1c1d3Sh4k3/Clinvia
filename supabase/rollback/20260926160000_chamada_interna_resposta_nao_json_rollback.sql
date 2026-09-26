-- Rollback de 20260926160000_chamada_interna_resposta_nao_json.sql
--
-- `is_active = false`, NUNCA `delete`: apagar a linha do catalogo PROMOVE o
-- componente. Sem linha, o piso implicito e `media` e `somente_painel` volta a
-- ser falso -- o rollback deixaria o componente MAIS barulhento que antes.

set lock_timeout = '5s';
set statement_timeout = '120s';

update public.incident_component_catalog
   set is_active  = false,
       updated_at = now()
 where component = 'chamada-interna:resposta-nao-json';
