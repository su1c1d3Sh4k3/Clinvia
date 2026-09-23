-- Teto de severidade: a IA ESCALA, nunca rebaixa.
--
-- O QUE ESTAVA ERRADO
-- Em dois lugares a severidade era decidida por `coalesce`, que e "o primeiro
-- que nao for nulo" — e nao "o pior dos dois":
--
--   * `incident_severidade_efetiva`: devolvia a severidade da IA se houvesse
--     uma, e so caia no catalogo quando a IA nao tinha opiniao. Entao a IA
--     dizendo 'baixa' num componente catalogado como 'alta' REBAIXAVA o
--     incidente. `api-scheduling` (agenda quebrada) podia virar aviso.
--   * `incident_finish_analysis`: `ai_severity = coalesce(ai_severity, v_sev)`.
--     O contrario — a IA nunca conseguia SUBIR um incidente que ja nascera com
--     severidade. Um erro que a IA leu e entendeu como critico ficava 'media'
--     porque alguem gravou 'media' primeiro.
--
-- Os dois defeitos apontam para o mesmo desenho ausente: nao ha ordem entre as
-- severidades em lugar nenhum do banco, so texto. Sem ordem, `coalesce` e o
-- unico operador disponivel, e ele nao sabe o que e "pior".
--
-- O QUE PASSA A VALER
-- 1. `incident_severidade_rank(text)` da a ordem: critica 3 > alta 2 > media 1
--    > baixa 0; qualquer coisa fora disso e -1 (nao opina).
-- 2. A severidade efetiva e a MAIOR entre a da IA e a do catalogo. Ou seja:
--    a linha do catalogo deixa de ser "valor padrao" e vira PISO. O que o
--    catalogo promete e o MINIMO que aquele componente vale; a IA pode subir
--    porque viu o erro, e nunca descer porque nao viu o contexto do negocio.
-- 3. Na hora de gravar a analise, `ai_severity` so e sobrescrito se a IA
--    trouxer algo MAIS grave do que ja estava la.
--
-- EFEITO EM PRODUCAO (esperado, conferido no teste ao lado)
-- Os dois incidentes abertos de `api-scheduling` tem `ai_severity = 'media'`
-- gravado. Com o piso do catalogo ('alta'), eles passam a valer ALTA — e alta
-- e severidade que sai por WhatsApp. Isso e o objetivo, nao efeito colateral:
-- agenda quebrada nao pode esperar o resumo de 2 em 2 horas.
--
-- O que NAO muda: `somente_painel` continua vencendo tudo. Severidade alta em
-- componente de painel (`zz-teste:`) segue sem sair por canal nenhum — o teto
-- decide o quanto importa, nao por onde sai.

create or replace function public.incident_severidade_rank(p_severidade text)
returns integer
language sql
immutable
parallel safe
as $$
    select case lower(coalesce(trim(p_severidade), ''))
               when 'critica' then 3
               when 'alta'    then 2
               when 'media'   then 1
               when 'baixa'   then 0
               else -1   -- vazio, nulo ou texto estranho: nao opina
           end;
$$;

comment on function public.incident_severidade_rank(text) is
    'Ordem das severidades (critica 3 > alta 2 > media 1 > baixa 0; -1 = sem opiniao). Existe para que severidade possa ser COMPARADA, e nao apenas escolhida por coalesce.';


create or replace function public.incident_severidade_efetiva(
    p_component   text,
    p_ai_severity text
)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
    -- A pior das duas vence. A IA escala (ela viu o erro); o catalogo e o piso
    -- (ele sabe o que o componente significa para a clinica). Nenhuma das duas
    -- opinando, 'media'.
    with opcoes(sev) as (
        select nullif(trim(p_ai_severity), '')
        union all
        select (select c.severidade_padrao from public.incident_component_info(p_component) c)
    )
    select coalesce(
        (select sev from opcoes
          where public.incident_severidade_rank(sev) >= 0
          order by public.incident_severidade_rank(sev) desc
          limit 1),
        'media'
    );
$$;

revoke all on function public.incident_severidade_efetiva(text, text)
    from public, anon, authenticated;
grant execute on function public.incident_severidade_efetiva(text, text) to service_role;


create or replace function public.incident_finish_analysis(
    p_incident_id uuid,
    p_result      jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_sev text := nullif(trim(coalesce(p_result ->> 'severidade', '')), '');
begin
    if v_sev is not null and v_sev not in ('critica','alta','media','baixa') then
        v_sev := null;
    end if;

    update public.incidents
       set ai_summary          = nullif(trim(coalesce(p_result ->> 'resumo', '')), ''),
           ai_probable_cause   = nullif(trim(coalesce(p_result ->> 'causa', '')), ''),
           ai_origin           = nullif(trim(coalesce(p_result ->> 'origem', '')), ''),
           -- A IA escala, nunca rebaixa: so grava se for MAIS grave do que ja
           -- estava. Antes era `coalesce(ai_severity, v_sev)`, que travava o
           -- valor no primeiro que chegasse.
           ai_severity         = case
                                     when v_sev is null then ai_severity
                                     when public.incident_severidade_rank(v_sev)
                                        > public.incident_severidade_rank(ai_severity)
                                     then v_sev
                                     else coalesce(ai_severity, v_sev)
                                 end,
           ai_impact           = nullif(trim(coalesce(p_result ->> 'impacto', '')), ''),
           ai_fix_n8n          = nullif(trim(coalesce(p_result ->> 'acao_n8n', '')), ''),
           ai_fix_system       = nullif(trim(coalesce(p_result ->> 'acao_sistema', '')), ''),
           ai_confidence       = case when jsonb_typeof(p_result -> 'confianca') = 'number'
                                      then least(1, greatest(0, (p_result ->> 'confianca')::numeric)) end,
           ai_model            = nullif(trim(coalesce(p_result ->> 'modelo', '')), ''),
           ai_tokens           = case when jsonb_typeof(p_result -> 'tokens') = 'number'
                                      then greatest(0, (p_result ->> 'tokens')::integer) end,
           ai_cost_usd         = case when jsonb_typeof(p_result -> 'custo_usd') = 'number'
                                      then greatest(0, (p_result ->> 'custo_usd')::numeric) end,
           analyzed_at         = now(),
           analysis_claimed_at = null,
           updated_at          = now()
     where id = p_incident_id;
end;
$$;

revoke all on function public.incident_finish_analysis(uuid, jsonb)
    from public, anon, authenticated;
grant execute on function public.incident_finish_analysis(uuid, jsonb) to service_role;

-- `incident_severidade_rank` nao le tabela nenhuma (e immutable e sem search_path
-- porque nao resolve nome de objeto), mas segue a mesma regra das outras: quem
-- nao precisa executar, nao executa.
revoke all on function public.incident_severidade_rank(text)
    from public, anon, authenticated;
grant execute on function public.incident_severidade_rank(text) to service_role;
