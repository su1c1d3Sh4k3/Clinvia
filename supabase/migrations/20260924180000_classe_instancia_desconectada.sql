-- Instancia desconectada deixa de ser uma classe barulhenta.
--
-- REGRA DELE (24/09/2026), para a classe inteira, nao so o pele-10:
--   * um aviso so, na desconexao. Baixa. Nada alem disso.
--   * nada enquanto durar. 30 dias desconectada continua sendo um aviso so.
--   * novo aviso so se desconectar de novo, DEPOIS de ter voltado.
--   * tentativa de envio para instancia desconectada NAO gera incidente —
--     nao e erro, e o sistema falando com uma instancia que o cliente desligou
--     de proposito.
--
-- O QUE FALTAVA, MEDIDO ANTES DE MEXER
-- ------------------------------------
-- 1. `uazapi:instancia-desconectada` ja estava no catalogo como **alta**, e
--    NINGUEM escrevia nesse componente: zero ocorrencias no repositorio fora da
--    propria migration que o cadastrou. O pele-10 passou 14 dias desconectado
--    sem um alerta porque a health-check so escreve em `notifications`, que
--    nunca foi ligada a `incidents`.
-- 2. O barulho que VIRIA era outro e pior: o caminho de envio devolve **502**
--    para instancia desconectada, e `serveMonitored` relata toda resposta
--    >= 500. Cada tentativa de envio viraria um incidente no componente
--    `evolution-send-message`, catalogado **alta**. As 34 falhas do pele-10 sao
--    anteriores ao monitoramento; se ele caisse hoje, seriam 34 alertas altos.
--
-- TETO DE SEVERIDADE (coluna nova)
-- --------------------------------
-- `incident_severidade_efetiva` devolve o PIOR entre o piso do catalogo e a
-- `ai_severity`. Isso e correto como regra geral — a IA viu o erro, ela pode
-- escalar. Mas torna "baixa" impossivel de garantir: bastaria o analisador
-- (`incident-analyze-scan`, */2, ativo) achar grave uma desconexao para a
-- classe voltar ao telefone dele pela porta dos fundos.
--
-- Entao o catalogo ganha um TETO, alem do piso. Piso e teto sao coisas
-- diferentes e as duas sao legitimas:
--   piso = "este componente importa pelo menos isto" (a IA pode nao saber)
--   teto = "sobre este componente ja foi decidido; a opiniao da IA nao muda"
-- Teto nulo = comportamento de hoje, a IA escala a vontade. So quem tem teto
-- declarado e clampado.
--
-- Isto e supressao na ORIGEM: a classe nem chega a nascer alta. Nao e teto de
-- envio na porta, que continua proibido — critica e alta saem sempre, quantas
-- forem.

begin;

alter table public.incident_component_catalog
    add column if not exists severidade_teto text;

alter table public.incident_component_catalog
    drop constraint if exists incident_component_catalog_severidade_teto_check;
alter table public.incident_component_catalog
    add constraint incident_component_catalog_severidade_teto_check
    check (severidade_teto is null or severidade_teto in ('critica', 'alta', 'media', 'baixa'));

comment on column public.incident_component_catalog.severidade_teto is
    'Teto de severidade do componente. Quando preenchido, a analise por IA NAO '
    'pode elevar o incidente acima disto. Nulo = sem teto (a IA escala a '
    'vontade). Use so para classe ja decidida, como instancia que o cliente '
    'desligou de proposito.';

-- `incident_component_info` e quem resolve exato/prefixo; precisa devolver o
-- teto tambem, senao a funcao de severidade nao tem como enxerga-lo.
--
-- Coluna nova no `returns table` = tipo de retorno diferente, e `create or
-- replace` recusa isso (42P13). Tem que dropar. Nao ha dependencia dura: corpo
-- de funcao SQL comum e resolvido em tempo de execucao, entao
-- `incident_severidade_efetiva` sobrevive ao drop e e recriada logo abaixo.
drop function if exists public.incident_component_info(text);

create function public.incident_component_info(p_component text)
returns table (
    component         text,
    natureza          text,
    descricao         text,
    acao_padrao       text,
    severidade_padrao text,
    severidade_teto   text,
    somente_painel    boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
    -- Exato vence prefixo; entre prefixos, o mais longo vence. Ordem identica
    -- a de antes: esta funcao so ganhou uma coluna.
    select c.component, c.natureza, c.descricao, c.acao_padrao,
           c.severidade_padrao, c.severidade_teto, c.somente_painel
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
    -- A pior das duas vence. A IA escala (ela viu o erro); o catalogo e o piso
    -- (ele sabe o que o componente significa para a clinica). Nenhuma das duas
    -- opinando, 'media'.
    --
    -- DEPOIS, o teto: se o catalogo declarou um, a escalada da IA e cortada
    -- nele. Sem isto nao existe forma de garantir que uma classe fique baixa —
    -- o analisador roda a cada 2 min e tem a ultima palavra sobre ai_severity.
    with info as (
        select severidade_padrao, severidade_teto
          from public.incident_component_info(p_component)
    ),
    opcoes(sev) as (
        select nullif(trim(p_ai_severity), '')
        union all
        select severidade_padrao from info
    ),
    pior as (
        select coalesce(
            (select sev from opcoes
              where public.incident_severidade_rank(sev) >= 0
              order by public.incident_severidade_rank(sev) desc
              limit 1),
            'media'
        ) as sev
    )
    select case
        when (select severidade_teto from info) is not null
             and public.incident_severidade_rank((select sev from pior))
                 > public.incident_severidade_rank((select severidade_teto from info))
        then (select severidade_teto from info)
        else (select sev from pior)
    end;
$$;

revoke all on function public.incident_component_info(text) from public, anon, authenticated;
revoke all on function public.incident_severidade_efetiva(text, text) from public, anon, authenticated;
grant execute on function public.incident_component_info(text) to service_role;
grant execute on function public.incident_severidade_efetiva(text, text) to service_role;

-- A classe em si: piso baixa E teto baixa. O cliente desligou de proposito;
-- para ele isso e informacao, nao emergencia.
update public.incident_component_catalog
   set severidade_padrao = 'baixa',
       severidade_teto   = 'baixa',
       descricao         = 'Instancia da API nao oficial (UAZAPI) perdeu a conexao com o WhatsApp.',
       acao_padrao       = 'Avisar o cliente uma vez. Reconectar em Conexoes. '
                           'Permanecer desconectada e escolha valida do cliente '
                           'e nao precisa de investigacao.',
       updated_at        = now()
 where component = 'uazapi:instancia-desconectada';

-- A gemea do Instagram/Meta: mesma natureza, mesma decisao. Cadastrada agora
-- para a classe nao voltar por um componente vizinho sem linha — componente sem
-- cadastro cai no piso implicito 'media' e deixa a IA ser a unica autora da
-- gravidade, que foi a origem medida do ruido em 23/09.
insert into public.incident_component_catalog
    (component, match_tipo, natureza, severidade_padrao, severidade_teto,
     somente_painel, descricao, acao_padrao, is_active)
values
    ('meta:instancia-desconectada', 'exato', 'detector', 'baixa', 'baixa', false,
     'Instancia da API oficial (Meta) perdeu a conexao.',
     'Avisar o cliente uma vez. Permanecer desconectada e escolha valida do cliente.',
     true)
on conflict (component) do update
   set severidade_padrao = excluded.severidade_padrao,
       severidade_teto   = excluded.severidade_teto,
       updated_at        = now();

commit;
