-- ANTES do teto de severidade (20260923400000).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_teto_severidade/antes.sql
--
-- Duas coisas de uma vez:
--  (1) a tabela-verdade do rebaixamento — o que a funcao devolve hoje quando a
--      IA opina MENOS grave que o catalogo;
--  (2) o efeito real nos incidentes abertos.

select jsonb_pretty(jsonb_build_object(
    'tabela_verdade', (
        select jsonb_agg(jsonb_build_object(
                    'componente', c.comp,
                    'catalogo',   (select i.severidade_padrao
                                     from public.incident_component_info(c.comp) i),
                    'ia_disse',   c.ia,
                    'efetiva',    public.incident_severidade_efetiva(c.comp, c.ia))
                order by c.ord)
          from (values
                (1, 'api-scheduling',  'baixa'),
                (2, 'api-scheduling',  'media'),
                (3, 'api-scheduling',  'critica'),
                (4, 'api-scheduling',  null),
                (5, 'openai-alerts',   'baixa'),
                (6, 'openai-alerts',   'critica'),
                (7, 'zz-teste:x',      'critica'),
                (8, 'nao-catalogado',  'baixa'),
                (9, 'nao-catalogado',  null)
               ) as c(ord, comp, ia)
    ),
    'incidentes_abertos', (
        select coalesce(jsonb_agg(jsonb_build_object(
                    'componente',  i.component,
                    'ai_severity', i.ai_severity,
                    'catalogo',    (select ci.severidade_padrao
                                      from public.incident_component_info(i.component) ci),
                    'efetiva',     public.incident_severidade_efetiva(i.component, i.ai_severity),
                    'notificado',  i.notified_count)
                order by i.first_seen), '[]'::jsonb)
          from public.incidents i
         where i.status <> 'resolved'
    ),
    'helper_ja_existe', exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'incident_severidade_rank')
));
