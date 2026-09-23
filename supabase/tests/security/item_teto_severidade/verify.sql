-- Estado DEPOIS de 20260923400000 (teto de severidade: a IA escala, nunca rebaixa).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_teto_severidade/verify.sql
--
-- Cada linha e uma afirmacao: `ok` false em qualquer uma reprova o item.

with checagens(item, ok, observado) as (
    values
    ('helper de ordem existe',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='incident_severidade_rank'),
     'public.incident_severidade_rank(text)'),

    ('ordem correta: critica > alta > media > baixa',
     public.incident_severidade_rank('critica') > public.incident_severidade_rank('alta')
     and public.incident_severidade_rank('alta') > public.incident_severidade_rank('media')
     and public.incident_severidade_rank('media') > public.incident_severidade_rank('baixa'),
     public.incident_severidade_rank('critica') || '>' || public.incident_severidade_rank('alta')
     || '>' || public.incident_severidade_rank('media')
     || '>' || public.incident_severidade_rank('baixa')),

    ('texto estranho nao opina (fica abaixo de baixa)',
     public.incident_severidade_rank('urgentissimo') < public.incident_severidade_rank('baixa')
     and public.incident_severidade_rank(null) < public.incident_severidade_rank('baixa'),
     'rank(lixo)=' || public.incident_severidade_rank('urgentissimo')),

    -- O defeito que este item fecha: a IA REBAIXANDO
    ('IA nao rebaixa: baixa em componente alta continua alta',
     public.incident_severidade_efetiva('api-scheduling', 'baixa') = 'alta',
     public.incident_severidade_efetiva('api-scheduling', 'baixa')),

    ('IA nao rebaixa: media em componente alta continua alta',
     public.incident_severidade_efetiva('api-scheduling', 'media') = 'alta',
     public.incident_severidade_efetiva('api-scheduling', 'media')),

    ('IA escala: critica em componente alta vira critica',
     public.incident_severidade_efetiva('api-scheduling', 'critica') = 'critica',
     public.incident_severidade_efetiva('api-scheduling', 'critica')),

    ('IA escala sobre piso baixo: critica em zz-teste vira critica',
     public.incident_severidade_efetiva('zz-teste:x', 'critica') = 'critica',
     public.incident_severidade_efetiva('zz-teste:x', 'critica')),

    ('sem IA vale o catalogo',
     public.incident_severidade_efetiva('api-scheduling', null) = 'alta'
     and public.incident_severidade_efetiva('openai-alerts', '') = 'media',
     public.incident_severidade_efetiva('api-scheduling', null) || '/' ||
     public.incident_severidade_efetiva('openai-alerts', '')),

    ('componente fora do catalogo: so a IA opina',
     public.incident_severidade_efetiva('nao-catalogado-xyz', 'baixa') = 'baixa',
     public.incident_severidade_efetiva('nao-catalogado-xyz', 'baixa')),

    ('ninguem opinando vale media',
     public.incident_severidade_efetiva('nao-catalogado-xyz', null) = 'media',
     public.incident_severidade_efetiva('nao-catalogado-xyz', null)),

    ('severidade invalida vinda da IA e ignorada, nao adotada',
     public.incident_severidade_efetiva('api-scheduling', 'gravissimo') = 'alta',
     public.incident_severidade_efetiva('api-scheduling', 'gravissimo')),

    -- Gravacao da analise: a IA so sobrescreve para MAIS grave
    ('incident_finish_analysis so sobe ai_severity',
     (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='incident_finish_analysis')
        ilike '%incident_severidade_rank(v_sev)%',
     'prosrc de incident_finish_analysis'),

    ('incident_finish_analysis nao usa mais o coalesce que travava',
     (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='incident_finish_analysis')
        not ilike '%ai_severity         = coalesce(ai_severity, v_sev)%',
     'prosrc de incident_finish_analysis'),

    -- Privilegios: `create or replace` reescreve tudo, entao se confere DEPOIS
    ('efetiva NAO e chamavel por anon',
     not has_function_privilege('anon',
        'public.incident_severidade_efetiva(text,text)','EXECUTE'),
     'has_function_privilege(anon, incident_severidade_efetiva)'),

    ('efetiva NAO e chamavel por authenticated',
     not has_function_privilege('authenticated',
        'public.incident_severidade_efetiva(text,text)','EXECUTE'),
     'has_function_privilege(authenticated, incident_severidade_efetiva)'),

    ('finish_analysis NAO e chamavel por anon',
     not has_function_privilege('anon',
        'public.incident_finish_analysis(uuid,jsonb)','EXECUTE'),
     'has_function_privilege(anon, incident_finish_analysis)'),

    ('finish_analysis NAO e chamavel por authenticated',
     not has_function_privilege('authenticated',
        'public.incident_finish_analysis(uuid,jsonb)','EXECUTE'),
     'has_function_privilege(authenticated, incident_finish_analysis)'),

    ('rank NAO e chamavel por anon',
     not has_function_privilege('anon',
        'public.incident_severidade_rank(text)','EXECUTE'),
     'has_function_privilege(anon, incident_severidade_rank)'),

    ('service_role executa as tres',
     has_function_privilege('service_role','public.incident_severidade_efetiva(text,text)','EXECUTE')
     and has_function_privilege('service_role','public.incident_finish_analysis(uuid,jsonb)','EXECUTE')
     and has_function_privilege('service_role','public.incident_severidade_rank(text)','EXECUTE'),
     'has_function_privilege(service_role, ...)'),

    ('efetiva continua security definer com search_path fixo',
     (select p.prosecdef and 'search_path=public' = any(coalesce(p.proconfig, array[]::text[]))
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='incident_severidade_efetiva'),
     'prosecdef+proconfig de incident_severidade_efetiva'),

    ('finish_analysis continua security definer com search_path fixo',
     (select p.prosecdef and 'search_path=public' = any(coalesce(p.proconfig, array[]::text[]))
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='incident_finish_analysis'),
     'prosecdef+proconfig de incident_finish_analysis'),

    -- `somente_painel` decide POR ONDE sai; o teto decide O QUANTO importa.
    -- Um nao pode passar por cima do outro.
    ('teto nao fura o somente_painel do zz-teste',
     (select c.somente_painel from public.incident_component_info('zz-teste:x') c),
     'somente_painel de zz-teste:'),

    -- Efeito real em producao
    ('incidente aberto de api-scheduling passou a valer alta',
     not exists (select 1 from public.incidents i
                  where i.component = 'api-scheduling' and i.status <> 'resolved'
                    and public.incident_severidade_efetiva(i.component, i.ai_severity)
                        <> 'alta'),
     coalesce((select string_agg(i.ai_severity || '->' ||
                public.incident_severidade_efetiva(i.component, i.ai_severity), ', ')
                 from public.incidents i
                where i.component='api-scheduling' and i.status<>'resolved'),
              'nenhum aberto')),

    ('nenhum incidente aberto foi REBAIXADO pelo teto',
     not exists (
        select 1 from public.incidents i
         where i.status <> 'resolved'
           and public.incident_severidade_rank(
                   public.incident_severidade_efetiva(i.component, i.ai_severity))
             < public.incident_severidade_rank(i.ai_severity)),
     'comparacao efetiva x ai_severity nos abertos')
)
select jsonb_pretty(jsonb_build_object(
    'reprovados', (select count(*) from checagens where not ok),
    'itens', (select jsonb_agg(jsonb_build_object(
                    'item', item, 'ok', ok, 'observado', observado) order by ok, item)
                from checagens),
    'promovidos_pelo_teto', (
        select coalesce(jsonb_agg(jsonb_build_object(
                    'componente', i.component,
                    'ia', i.ai_severity,
                    'efetiva', public.incident_severidade_efetiva(i.component, i.ai_severity),
                    'ja_notificado', i.notified_count > 0)), '[]'::jsonb)
          from public.incidents i
         where i.status <> 'resolved'
           and public.incident_severidade_rank(
                   public.incident_severidade_efetiva(i.component, i.ai_severity))
             > public.incident_severidade_rank(i.ai_severity))
));
