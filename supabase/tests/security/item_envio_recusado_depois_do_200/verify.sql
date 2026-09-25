-- Mensagem aceita no envio e recusada depois (24/09/2026).
-- Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.

-- MUDANCA DE DECISAO EM 25/09/2026, por ordem nominal dele: recusa AVULSA da
-- Meta deixou de acordar o telefone. O que acorda agora e defeito nosso
-- (envio:defeito-, alta), conta inteira (envio:conta-, critica) e VOLUME acima
-- de 3x a media de 7 dias (envio:pico-diario, alta). As duas familias abaixo
-- ficam no painel — o atendente ja ve a caixa vermelha no cartao da mensagem.
-- As checagens 1, 2 e 6 cobravam o oposto e foram INVERTIDAS de proposito.
with
-- 1-2. As duas familias existem, ativas, com o piso de gravidade combinado e
--      agora marcadas somente_painel.
c1 as (
    select 1 as ord,
           'envio:rejeitado- catalogado como alta e somente_painel' as checagem,
           case when severidade_padrao = 'alta' and somente_painel
                 and is_active and match_tipo = 'prefixo'
                then 'ok' else 'FALHOU' end as resultado,
           severidade_padrao || ' / painel=' || somente_painel::text as detalhe
      from public.incident_component_catalog
     where component = 'envio:rejeitado-'
),
c2 as (
    select 2, 'envio:bloqueado- catalogado como media e somente_painel',
           case when severidade_padrao = 'media' and somente_painel
                 and is_active and match_tipo = 'prefixo'
                then 'ok' else 'FALHOU' end,
           severidade_padrao || ' / painel=' || somente_painel::text
      from public.incident_component_catalog
     where component = 'envio:bloqueado-'
),
-- 3-4. O componente REAL, com codigo e instancia entre parenteses, cai na
--      familia certa. E este o formato que o `webhook-handle-status` escreve.
c3 as (
    select 3, 'componente real rejeitado resolve para a familia rejeitado',
           case when component = 'envio:rejeitado-' and severidade_padrao = 'alta'
                then 'ok' else 'FALHOU' end,
           coalesce(component, '(nao catalogado)')
      from public.incident_component_info('envio:rejeitado-131042 (pele-10)')
),
c4 as (
    select 4, 'componente real bloqueado resolve para a familia bloqueado',
           case when component = 'envio:bloqueado-' and severidade_padrao = 'media'
                then 'ok' else 'FALHOU' end,
           coalesce(component, '(nao catalogado)')
      from public.incident_component_info('envio:bloqueado-131047 (meta-488512407686498)')
),
-- 5. O piso e PISO, nao teto: gravidade vinda da IA acima do piso vence.
--    Vale a pena travar isto num teste porque ja foi entendido ao contrario.
c5 as (
    select 5, 'gravidade da IA acima do piso continua vencendo',
           case when public.incident_severidade_efetiva(
                        'envio:bloqueado-131047 (pele-10)', 'critica') = 'critica'
                then 'ok' else 'FALHOU' end,
           public.incident_severidade_efetiva('envio:bloqueado-131047 (pele-10)', 'critica')
),
-- 6. As duas ficam na peneira que segura alerta no painel. Se alguem tirar
--    somente_painel de uma delas, recusa avulsa volta a acordar o telefone —
--    e este teste e que avisa.
c6 as (
    select 6, 'as duas familias sao somente_painel',
           case when count(*) = 2 then 'ok' else 'FALHOU' end,
           count(*)::text || ' de 2 marcada(s)'
      from public.incident_component_catalog
     where component in ('envio:rejeitado-', 'envio:bloqueado-')
       and somente_painel
),
-- 7. As duas tem acao_padrao escrita: o alerta precisa dizer o que fazer, e
--    "o destinatario nao recebeu" e a frase que nao pode faltar.
c7 as (
    select 7, 'as duas familias dizem que o destinatario nao recebeu',
           case when count(*) = 2 then 'ok' else 'FALHOU' end,
           count(*)::text || ' de 2'
      from public.incident_component_catalog
     where component in ('envio:rejeitado-', 'envio:bloqueado-')
       and acao_padrao ilike '%NAO recebeu%'
)
select * from c1
union all select * from c2
union all select * from c3
union all select * from c4
union all select * from c5
union all select * from c6
union all select * from c7
order by ord;
