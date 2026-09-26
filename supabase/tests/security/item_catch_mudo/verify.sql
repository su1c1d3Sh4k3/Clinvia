-- Catch que engole o erro dentro de edge function (26/09/2026).
--
-- A barreira do REPOSITORIO e `check.py` (roda sem rede, e o que o CI executa).
-- Este verify cobre a outra metade: o unico ponto que deixou de ser mudo nesta
-- rodada precisa de linha no catalogo, senao o reportIncident cai no piso
-- implicito `media` com a IA como unica autora da gravidade.
--
-- Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.

with
-- 1. A linha existe e esta ativa. Sem ela o componente nao some — fica SEM
--    piso e SEM `somente_painel`, ou seja, mais barulhento, nao menos.
c1 as (
    select 1 as ord,
           'componente chamada-interna:resposta-nao-json cadastrado e ativo' as checagem,
           case when count(*) = 1 then 'ok' else 'FALHOU' end as resultado,
           count(*)::text || ' linha(s) ativa(s)' as detalhe
      from public.incident_component_catalog
     where component = 'chamada-interna:resposta-nao-json'
       and is_active
),
-- 2. Gravidade efetiva com a IA calada. `media` e deliberado: quem responde 2xx
--    esta no ar, o que se perdeu foi o conteudo de uma chamada interna.
c2 as (
    select 2, 'gravidade efetiva sem opiniao da IA = media',
           case when public.incident_severidade_efetiva(
                         'chamada-interna:resposta-nao-json', null) = 'media'
                then 'ok' else 'FALHOU' end,
           coalesce(public.incident_severidade_efetiva(
                        'chamada-interna:resposta-nao-json', null), 'nulo')
),
-- 3. Piso e PISO: sem teto, a IA ainda pode subir isto se o caso for grave.
--    Teto aqui seria mordaca, nao calibragem.
c3 as (
    select 3, 'sem teto de gravidade (piso nao vira mordaca)',
           case when severidade_teto is null then 'ok' else 'FALHOU' end,
           coalesce(severidade_teto, 'null')
      from public.incident_component_catalog
     where component = 'chamada-interna:resposta-nao-json'
),
-- 4. Chega ao telefone pelas regras normais de `media` (resumo de 2h). O que
--    segura alerta e `somente_painel`, nunca o piso baixo.
c4 as (
    select 4, 'somente_painel = false',
           case when somente_painel = false then 'ok' else 'FALHOU' end,
           somente_painel::text
      from public.incident_component_catalog
     where component = 'chamada-interna:resposta-nao-json'
),
-- 5. Casamento exato: o componente e uma constante no codigo, nao um prefixo.
c5 as (
    select 5, 'match_tipo exato e natureza servico',
           case when match_tipo = 'exato' and natureza = 'servico'
                then 'ok' else 'FALHOU' end,
           match_tipo || ' / ' || natureza
      from public.incident_component_catalog
     where component = 'chamada-interna:resposta-nao-json'
),
-- 6. Acao padrao escrita: sem ela quem le o alerta as 3h da manha nao sabe o
--    que fazer, e o componente vira ruido cadastrado.
c6 as (
    select 6, 'descricao e acao padrao preenchidas',
           case when length(coalesce(descricao, '')) > 40
                 and length(coalesce(acao_padrao, '')) > 80
                then 'ok' else 'FALHOU' end,
           length(coalesce(descricao, ''))::text || ' / '
               || length(coalesce(acao_padrao, ''))::text || ' chars'
      from public.incident_component_catalog
     where component = 'chamada-interna:resposta-nao-json'
),
-- 7. Medicao, sem veredito: quantas chamadas internas ja responderam 2xx
--    ilegivel desde que o ponto passou a falar. Zero aqui e bom sinal.
c7 as (
    select 7, 'incidentes registrados ate agora',
           count(*)::text || ' incidente(s)',
           coalesce(to_char(max(created_at) at time zone 'America/Sao_Paulo',
                            'DD/MM HH24:MI'), '-')
      from public.incidents
     where component = 'chamada-interna:resposta-nao-json'
)
select checagem, resultado, detalhe from (
    select * from c1 union all select * from c2 union all select * from c3
    union all select * from c4 union all select * from c5 union all select * from c6
    union all select * from c7
) t order by ord, checagem;
