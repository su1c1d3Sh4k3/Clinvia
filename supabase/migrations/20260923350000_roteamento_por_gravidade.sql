-- Roteamento por gravidade: critica/alta na hora, media/baixa so no resumo de 2h.
--
-- O DEFEITO (relatado pelo user em 23/09/2026, com os dois alertas na mao):
-- "recebi uma BAIXA e uma MEDIA imediatas". A regra combinada era outra —
-- critica e alta vao na hora, media e baixa vao em resumo agrupado a cada 2
-- horas, so se houver algo.
--
-- POR QUE ACONTECEU: `incident_claim_for_notification` reclamava QUALQUER
-- incidente ja analisado, de qualquer severidade. A severidade so era usada para
-- ORDENAR a fila, nunca para decidir quem entra nela. O comentario da migration
-- 20260923320000 ate afirmava que "media/baixa tem o resumo agrupado como
-- caminho proprio" — mas o resumo nunca foi agendado: a listagem do pg_cron tem
-- 38 jobs e nenhum chama `alert-notify` com action=summary. Ou seja, media/baixa
-- tinham DOIS caminhos abertos ao mesmo tempo: o individual, que funcionava, e o
-- agrupado, que nao existia.
--
-- ESTA MIGRATION FAZ QUATRO COISAS:
--
-- 1. O claim passa a exigir `ai_severity in ('critica','alta')`. A espera de 2
--    minutos pela analise continua valendo para elas; media/baixa deixam de ser
--    reclamadas para envio individual, sempre.
--
-- 2. Cria o caminho que faltava: `incident_summary_pending(horas)` lista o que
--    entra no resumo, e um cron `alert-summary` a cada 2 horas so acorda a edge
--    function quando essa lista nao esta vazia. Uma funcao so, usada pelo portao
--    E pela mensagem — portao e conteudo divergirem foi exatamente o que deixou o
--    despachante acordando a toa antes.
--
-- 3. Tira a manutencao interna do WhatsApp. Coluna nova `somente_painel` no
--    catalogo: o componente continua abrindo incidente e aparecendo no painel, mas
--    nunca vira mensagem. Marcada hoje so para
--    'monitoramento:componente-nao-catalogado' — "isso e manutencao, nao
--    incidente" (user). Deixei 'monitoramento:analise-indisponivel' FORA da marca
--    de proposito: analisador parado degrada todo alerta critico que sair depois,
--    entao e operacao, nao faxina. Se ele discordar, e uma linha de update.
--
-- 4. `incident_notify_pending_count` muda junto e com a MESMA condicao, incluindo
--    a exclusao por `somente_painel`. As duas divergirem tem efeitos simetricos e
--    ruins: portao mudo com claim cheio (alerta que nunca sai) ou portao barulhento
--    com claim vazio (function acordada de minuto em minuto para nada).
--
-- JANELA DO RESUMO: entra quem teve evento NOVO nas ultimas 2 horas
-- (`last_seen`), nao todo incidente aberto. Incidente media cronico e aberto ha
-- uma semana sem novidade nao repete no resumo de 2 em 2 horas; volta a aparecer
-- no ciclo em que voltar a acontecer. E a leitura honesta de "so se houver algo".
--
-- SEVERIDADE NULA: `ai_severity is null` (incidente que nasceu sem severidade
-- inicial e ainda nao foi analisado) cai no resumo, nao no vazio. Antes ele nao
-- casava nem com o individual nem com o `in ('media','baixa')` do resumo e
-- sumiria dos dois caminhos.
--
-- NADA RETROATIVO: media/baixa ja notificadas continuam como estao. As que
-- estiverem na fila agora simplesmente deixam de ser reclamadas e passam a sair
-- no proximo resumo, se ainda tiverem atividade na janela.

-- ── 1. catalogo: quem nunca vai para o WhatsApp ──────────────────────────────

alter table public.incident_component_catalog
    add column if not exists somente_painel boolean not null default false;

comment on column public.incident_component_catalog.somente_painel is
    'true = o componente abre incidente e aparece no painel, mas NUNCA vira mensagem de WhatsApp (nem individual, nem no resumo). Para tarefa interna de manutencao da propria plataforma, que nao e incidente de operacao.';

update public.incident_component_catalog
   set somente_painel = true,
       -- o texto tambem era recado de desenvolvedor; a mensagem de operacao nao
       -- e lugar de instrucao de cadastro (defeito 4 do mesmo relato)
       descricao = 'Registra que chegou um incidente de um componente sem linha no catalogo, entao o alerta dele saiu sem a explicacao do que o servico faz. E manutencao da propria plataforma: fica no painel e nunca vira mensagem.',
       acao_padrao = 'O nome do componente que faltou esta no route deste registro. A linha dele entra em incident_component_catalog por migration — o catalogo nao aceita insert ad-hoc de proposito.',
       updated_at = now()
 where component = 'monitoramento:componente-nao-catalogado';

-- O resolvedor ganha a coluna. Trocar o tipo de retorno obriga drop + create:
-- adicionar coluna a um `returns table` nao e aceito por `create or replace`.
-- Ninguem depende dela em view nem em coluna gerada — so chamadas por nome, que
-- continuam validas com uma coluna a mais no retorno.
drop function if exists public.incident_component_info(text);

create function public.incident_component_info(p_component text)
returns table (
    component      text,
    natureza       text,
    descricao      text,
    acao_padrao    text,
    somente_painel boolean,
    catalogado     boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
    select c.component, c.natureza, c.descricao, c.acao_padrao, c.somente_painel, true
      from public.incident_component_catalog c
     where c.is_active
       and (
            (c.match_tipo = 'exato'   and c.component = p_component)
         or (c.match_tipo = 'prefixo' and p_component like c.component || '%')
       )
     order by case when c.match_tipo = 'exato' then 0 else 1 end,
              length(c.component) desc
     limit 1;
$$;

comment on function public.incident_component_info(text) is
    'Resolve a descricao de um componente para o alerta: chave exata vence prefixo, prefixo mais longo vence prefixo curto. Devolve zero linhas quando o componente nao esta catalogado — quem chama trata isso como "componente nao catalogado". `somente_painel` diz se ele pode virar mensagem.';

revoke all on function public.incident_component_info(text) from public, anon, authenticated;
grant execute on function public.incident_component_info(text) to service_role;

-- ── 2. claim individual: so critica e alta ───────────────────────────────────

create or replace function public.incident_claim_for_notification(p_limit integer default 10)
returns table (
    id uuid, source text, component text, ai_severity text, ai_summary text,
    ai_probable_cause text, ai_origin text, ai_fix_system text, ai_fix_n8n text,
    event_count integer, first_seen timestamptz, last_seen timestamptz,
    owner_id uuid, affected_tenants uuid[], analyzed_at timestamptz,
    kind text, ocorrencias_novas integer, desde timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado   boolean;
    v_cooldown integer;
begin
    select coalesce(s.alert_notify_enabled, true),
           greatest(0, coalesce(s.incident_notify_cooldown_min, 60))
      into v_ligado, v_cooldown
      from public.llm_platform_settings s limit 1;

    if v_ligado is false then
        return;
    end if;

    return query
    with alvo as (
        select i.id,
               case when i.notified_count = 0 then 'individual' else 'recorrencia' end as kind,
               greatest(0, i.event_count - i.notified_at_event_count)                  as novas,
               i.last_notified_at                                                      as desde
          from public.incidents i
         where i.status <> 'resolved'
           -- AVISO IMEDIATO E SO PARA CRITICA E ALTA. Media e baixa saem no
           -- resumo de 2 em 2 horas (incident_summary_pending) e nunca aqui.
           and i.ai_severity in ('critica', 'alta')
           -- analisado sai na hora; sem analise espera 2 minutos e entao sai
           -- degradada, com o erro bruto. Nunca fica presa.
           and (i.analyzed_at is not null
                or i.created_at < now() - interval '2 minutes')
           -- manutencao interna da plataforma fica no painel e nao vira mensagem
           and not coalesce(
                (select ci.somente_painel from public.incident_component_info(i.component) ci),
                false)
           -- nao pisa em despacho que ja esta em andamento
           and (i.notify_claimed_at is null
                or i.notify_claimed_at < now() - interval '5 minutes')
           -- respeita o recuo de quem acabou de falhar
           and (i.notify_next_attempt_at is null
                or i.notify_next_attempt_at <= now())
           and (
                i.notified_count = 0
                or (
                    -- so volta a falar se continuou acontecendo DEPOIS do ultimo aviso
                    i.event_count > i.notified_at_event_count
                    and i.last_notified_at < now() - make_interval(mins => v_cooldown)
                )
           )
         order by
            case i.ai_severity when 'critica' then 0 else 1 end,
            i.last_seen desc
         limit greatest(1, coalesce(p_limit, 10))
         for update skip locked
    )
    update public.incidents i
       set notify_claimed_at = now(),
           updated_at        = now()
      from alvo a
     where i.id = a.id
    returning i.id, i.source, i.component, i.ai_severity, i.ai_summary, i.ai_probable_cause,
              i.ai_origin, i.ai_fix_system, i.ai_fix_n8n, i.event_count, i.first_seen,
              i.last_seen, i.owner_id, i.affected_tenants, i.analyzed_at,
              a.kind, a.novas, a.desde;
end;
$$;

revoke all on function public.incident_claim_for_notification(integer) from public, anon, authenticated;
grant execute on function public.incident_claim_for_notification(integer) to service_role;

create or replace function public.incident_notify_pending_count()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
    select count(*)::integer
      from public.incidents i
     where i.status <> 'resolved'
       and i.ai_severity in ('critica', 'alta')
       and (i.analyzed_at is not null or i.created_at < now() - interval '2 minutes')
       and not coalesce(
            (select ci.somente_painel from public.incident_component_info(i.component) ci),
            false)
       and (i.notify_claimed_at is null or i.notify_claimed_at < now() - interval '5 minutes')
       and (i.notify_next_attempt_at is null or i.notify_next_attempt_at <= now())
       and (
            i.notified_count = 0
            or (i.event_count > i.notified_at_event_count
                and i.last_notified_at < now() - make_interval(mins => greatest(0, coalesce(
                    (select s.incident_notify_cooldown_min from public.llm_platform_settings s limit 1), 60))))
       );
$$;

revoke all on function public.incident_notify_pending_count() from public, anon, authenticated;
grant execute on function public.incident_notify_pending_count() to service_role;

-- ── 3. o resumo agrupado, que nunca existiu ──────────────────────────────────

-- Fonte UNICA do resumo: o portao do cron conta esta lista e a edge function
-- manda exatamente ela. Duas consultas parecidas para o mesmo fim foi o defeito
-- que esta migration esta consertando em outro lugar; nao repetir aqui.
create or replace function public.incident_summary_pending(p_hours integer default 2)
returns table (
    id           uuid,
    component    text,
    ai_summary   text,
    ai_severity  text,
    event_count  integer,
    last_seen    timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
    select i.id, i.component, i.ai_summary, i.ai_severity, i.event_count, i.last_seen
      from public.incidents i
     where i.status <> 'resolved'
       -- severidade nula entra aqui: sem isto ela nao teria caminho nenhum
       and (i.ai_severity is null or i.ai_severity in ('media', 'baixa'))
       and i.last_seen >= now() - make_interval(hours => greatest(1, coalesce(p_hours, 2)))
       and not coalesce(
            (select ci.somente_painel from public.incident_component_info(i.component) ci),
            false)
     order by i.event_count desc, i.last_seen desc
     limit 20;
$$;

comment on function public.incident_summary_pending(integer) is
    'O que entra no resumo agrupado de media/baixa: aberto, com evento novo na janela, fora da marca somente_painel. Usada pelo portao do cron E pelo corpo da mensagem — lista vazia significa que o resumo nao e enviado.';

revoke all on function public.incident_summary_pending(integer) from public, anon, authenticated;
grant execute on function public.incident_summary_pending(integer) to service_role;

create or replace function public.invoke_alert_summary()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url  text;
    v_jwt  text;
    v_edge text;
    v_on   boolean;
    v_n    integer;
begin
    select coalesce(s.alert_notify_enabled, true) and coalesce(s.alert_summary_enabled, true)
      into v_on
      from public.llm_platform_settings s limit 1;
    if v_on is false then
        return;
    end if;

    -- "so se houver algo": sem fila, nem chamada HTTP acontece.
    select count(*) into v_n from public.incident_summary_pending(2);
    if coalesce(v_n, 0) = 0 then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'alert-notify',
        p_origem  := 'cron:alert-summary',
        p_url     := v_url || '/functions/v1/alert-notify',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            -- a function compara com o proprio SUPABASE_SERVICE_ROLE_KEY dela,
            -- que ja e `sb_secret_`; o vault ainda guarda o JWT legado no nome
            -- antigo. Ler a chave errada aqui e o 401 invisivel de 23/09.
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := jsonb_build_object('action', 'summary', 'hours', 2)
    );
exception when others then
    raise warning 'invoke_alert_summary: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_alert_summary() from public, anon, authenticated;
grant execute on function public.invoke_alert_summary() to service_role;

do $$
begin
    perform cron.unschedule('alert-summary');
exception when others then
    null;
end;
$$;

-- De 2 em 2 horas, em ponto. Nao e */2 no campo de minuto: e hora.
select cron.schedule('alert-summary', '0 */2 * * *', $$select public.invoke_alert_summary();$$);
