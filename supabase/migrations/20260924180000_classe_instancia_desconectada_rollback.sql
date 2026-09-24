-- Rollback de 20260924180000_classe_instancia_desconectada.sql
--
-- Volta a severidade da classe para 'alta' e devolve as duas funcoes ao
-- comportamento sem teto. A COLUNA `severidade_teto` NAO e dropada de
-- proposito: dropar quebraria qualquer teto declarado depois desta migration,
-- e uma coluna a mais que ninguem le e inerte. Se a intencao for mesmo apagar,
-- o drop esta comentado no fim.

begin;

-- Sem o teto no retorno, a funcao volta a assinatura antiga. `create or
-- replace` NAO muda o tipo de retorno de uma funcao que devolve tabela, entao
-- precisa dropar antes — e `incident_severidade_efetiva` depende dela, por isso
-- as duas sao recriadas aqui.
drop function if exists public.incident_component_info(text);

create function public.incident_component_info(p_component text)
returns table (
    component         text,
    natureza          text,
    descricao         text,
    acao_padrao       text,
    severidade_padrao text,
    somente_painel    boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
    select c.component, c.natureza, c.descricao, c.acao_padrao,
           c.severidade_padrao, c.somente_painel
      from public.incident_component_catalog c
     where c.is_active
       and (
            (c.match_tipo = 'exato'   and c.component = p_component)
         or (c.match_tipo = 'prefixo' and p_component like c.component || '%')
       )
     order by (c.match_tipo = 'exato') desc, length(c.component) desc
     limit 1;
$$;

create or replace function public.incident_severidade_efetiva(p_component text, p_ai_severity text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
    with opcoes(sev) as (
        select nullif(trim(p_ai_severity), '')
        union all
        select severidade_padrao from public.incident_component_info(p_component)
    )
    select coalesce(
        (select sev from opcoes
          where public.incident_severidade_rank(sev) >= 0
          order by public.incident_severidade_rank(sev) desc
          limit 1),
        'media'
    );
$$;

revoke all on function public.incident_component_info(text) from public, anon, authenticated;
revoke all on function public.incident_severidade_efetiva(text, text) from public, anon, authenticated;
grant execute on function public.incident_component_info(text) to service_role;
grant execute on function public.incident_severidade_efetiva(text, text) to service_role;

-- A classe volta a ser alta e o teto sai de cena.
update public.incident_component_catalog
   set severidade_padrao = 'alta',
       severidade_teto   = null,
       updated_at        = now()
 where component = 'uazapi:instancia-desconectada';

delete from public.incident_component_catalog
 where component = 'meta:instancia-desconectada';

commit;

-- Para apagar a coluna tambem (so se nenhum outro componente tiver teto):
-- alter table public.incident_component_catalog drop column severidade_teto;
