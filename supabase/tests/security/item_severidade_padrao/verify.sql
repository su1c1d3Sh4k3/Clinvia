-- Teste de 20260923360000 (gravidade sem depender da IA + familias novas).
--
-- Uma unica instrucao: o `supabase db query` devolve so o ultimo result set.
--
-- NAO chama incident_claim_for_notification: ela RESERVA o incidente por 5 min e
-- atrasaria alerta de verdade. As condicoes dela sao conferidas no texto
-- (pg_proc.prosrc) e o COMPORTAMENTO e conferido pela function pura
-- incident_severidade_efetiva, que nao escreve nada.
--
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_severidade_padrao/verify.sql
-- Esperado: todas as linhas com ok = true.

with
src as (
    select p.proname, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('incident_claim_for_notification', 'incident_notify_pending_count',
                         'incident_summary_pending', 'incident_severidade_efetiva')
),
checagens as (

    -- ── A. privilegio ────────────────────────────────────────────────────────
    select 'A1 gravidade efetiva negada a anon' as item,
           has_function_privilege('anon', 'public.incident_severidade_efetiva(text,text)', 'EXECUTE') = false as ok
    union all
    select 'A2 gravidade efetiva negada a authenticated',
           has_function_privilege('authenticated', 'public.incident_severidade_efetiva(text,text)', 'EXECUTE') = false
    union all
    select 'A3 gravidade efetiva liberada a service_role',
           has_function_privilege('service_role', 'public.incident_severidade_efetiva(text,text)', 'EXECUTE') = true
    union all
    select 'A4 resolvedor de catalogo segue negado a anon',
           has_function_privilege('anon', 'public.incident_component_info(text)', 'EXECUTE') = false

    -- ── B. o buraco: critico sem analise nao pode cair no resumo ─────────────
    union all
    select 'B1 alert-notify sem analise da IA e critica',
           public.incident_severidade_efetiva('alert-notify', null) = 'critica'
    union all
    select 'B2 openai:sem_credito sem analise da IA e critica',
           public.incident_severidade_efetiva('openai:sem_credito', null) = 'critica'
    union all
    select 'B3 automation-send-queue sem analise da IA e alta',
           public.incident_severidade_efetiva('automation-send-queue', null) = 'alta'
    union all
    select 'B4 api-public-booking sem analise da IA e alta',
           public.incident_severidade_efetiva('api-public-booking', null) = 'alta'
    union all
    -- INVERTIDO em 24/09, e a inversao e o ponto: cobrava que a IA pudesse
    -- DESCER a gravidade de um componente critico. O piso do catalogo e PISO,
    -- nao teto — a funcao devolve o PIOR dos dois — entao esta linha so passaria
    -- se o piso estivesse quebrado. Descer so acontece com `severidade_teto`
    -- preenchido, que e excecao decidida por componente.
    select 'B5 IA nao desce a gravidade de um componente critico sem teto',
           public.incident_severidade_efetiva('alert-notify', 'baixa') = 'critica'
           and (select severidade_teto is null from public.incident_component_catalog
                 where component = 'alert-notify' and is_active)
    union all
    select 'B6 IA sobe a gravidade de um componente baixo',
           public.incident_severidade_efetiva('simulacao-de-alerta', 'critica') = 'critica'
    union all
    -- componente fora do catalogo nao cala nem grita
    select 'B7 componente nao catalogado sem analise cai em media',
           public.incident_severidade_efetiva('componente-que-nao-existe', null) = 'media'
    union all
    select 'B8 string vazia conta como sem analise',
           public.incident_severidade_efetiva('alert-notify', '') = 'critica'

    -- ── C. as tres funcoes de roteamento usam a MESMA fonte ──────────────────
    union all
    select 'C1 claim roteia por gravidade efetiva',
           (select prosrc like '%incident_severidade_efetiva(i.component, i.ai_severity)%' from src
             where proname = 'incident_claim_for_notification')
    union all
    select 'C2 portao roteia por gravidade efetiva',
           (select prosrc like '%incident_severidade_efetiva(i.component, i.ai_severity)%' from src
             where proname = 'incident_notify_pending_count')
    union all
    select 'C3 resumo roteia por gravidade efetiva',
           (select prosrc like '%incident_severidade_efetiva(i.component, i.ai_severity)%' from src
             where proname = 'incident_summary_pending')
    union all
    -- o `is null` solto do resumo tinha que sumir: nulo agora e resolvido antes
    select 'C4 resumo nao tem mais o atalho de severidade nula',
           (select prosrc not like '%i.ai_severity is null%' from src
             where proname = 'incident_summary_pending')
    union all
    select 'C5 claim e portao seguem filtrando somente_painel',
           (select bool_and(prosrc like '%somente_painel%') from src
             where proname in ('incident_claim_for_notification', 'incident_notify_pending_count'))
    union all
    select 'C6 gravidade efetiva le o catalogo, nao uma lista fixa',
           (select prosrc like '%incident_component_info%' from src
             where proname = 'incident_severidade_efetiva')

    -- ── D. os dois caminhos nao se cruzam nem deixam buraco ──────────────────
    union all
    select 'D1 nenhum critica/alta efetiva entra no resumo',
           not exists (select 1 from public.incident_summary_pending(24) s
                        join public.incidents i on i.id = s.id
                       where public.incident_severidade_efetiva(i.component, i.ai_severity)
                             in ('critica', 'alta'))
    union all
    select 'D2 resumo nao devolve gravidade nula na mensagem',
           not exists (select 1 from public.incident_summary_pending(24) where ai_severity is null)
    union all
    select 'D3 nenhum resolvido entra no resumo',
           not exists (select 1 from public.incident_summary_pending(24) s
                        join public.incidents i on i.id = s.id
                       where i.status = 'resolved')

    -- ── E. a coluna e o catalogo ─────────────────────────────────────────────
    union all
    select 'E1 severidade_padrao e obrigatoria e validada',
           exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'incident_component_catalog'
                      and column_name = 'severidade_padrao' and is_nullable = 'NO')
           and exists (select 1 from pg_constraint
                        where conname = 'incident_component_catalog_severidade_padrao_check')
    union all
    select 'E2 nenhuma linha do catalogo com gravidade invalida',
           not exists (select 1 from public.incident_component_catalog
                        where severidade_padrao not in ('critica', 'alta', 'media', 'baixa'))
    union all
    select 'E3 as 10 familias novas estao no catalogo e ativas',
           (select count(*) = 10 from public.incident_component_catalog
             where is_active
               and component in ('canal:whatsapp-alertas', 'uzapi-', 'evolution-send-message',
                                 'uazapi:instancia-desconectada', 'meta-send-message',
                                 'instagram-refresh-token', 'google-calendar-', 'gemini:',
                                 'n8n:no-silencioso', 'cron-health-watch'))
    union all
    -- o canal que carrega todo alerta nao pode ser faxina nem gravidade baixa
    select 'E4 canal de alertas e critico e vai ao WhatsApp',
           (select severidade_padrao = 'critica' and somente_painel = false
              from public.incident_component_info('canal:whatsapp-alertas'))
    union all
    select 'E5 cron-health-watch tem linha propria',
           (select natureza = 'servico' and severidade_padrao = 'alta'
              from public.incident_component_info('cron-health-watch'))
    union all
    select 'E6 gemini continua sendo fallback de gravidade baixa',
           (select severidade_padrao = 'baixa'
              from public.incident_component_info('gemini:flash_indisponivel'))
    union all
    -- Lista nominal em vez de contagem: quatro marcas novas entraram por decisao
    -- e contar so avisa que o numero mudou, sem dizer quem. O que precisa falhar
    -- e componente de OPERACAO ganhando a marca — esse fica mudo para sempre.
    select 'E7 somente_painel so nos componentes que foram decididos assim',
           not exists (
               select 1 from public.incident_component_catalog
                where is_active and somente_painel
                  and component not in ('entrada:', 'front:', 'simulacao-de-alerta',
                                        'zz-teste:',
                                        'monitoramento:componente-nao-catalogado',
                                        -- 25/09/2026: os tres do catalogo de erro
                                        -- silencioso que ficam no painel de
                                        -- proposito. Nenhum deles perde mensagem
                                        -- de paciente: `recibo:banco-` perde o
                                        -- COMPROVANTE de entrega de mensagem que
                                        -- ja saiu, `conversa:orfa-migracao` parte
                                        -- o historico em dois cards sem descartar
                                        -- nada, e `template-sends:log` so faz o
                                        -- dashboard de Satisfacao subcontar.
                                        -- Acordar alguem de madrugada por um
                                        -- recibo de leitura seria ensinar que
                                        -- vermelho pode ser ignorado.
                                        'recibo:banco-',
                                        'conversa:orfa-migracao',
                                        'template-sends:log')
           )
    union all
    select 'E8 catalogo sem instrucao de cadastro na descricao',
           not exists (select 1 from public.incident_component_catalog
                        where is_active and descricao ilike '%cadastre%')

    -- ── F. o resolvedor nao regrediu com o drop/create ───────────────────────
    union all
    select 'F1 exato ainda vence prefixo',
           (select i1.severidade_padrao = 'critica' and i2.natureza = 'detector'
              from public.incident_component_info('openai:sem_credito') i1,
                   public.incident_component_info('openai:um_kind_que_nao_existe') i2)
    union all
    select 'F2 prefixo mais longo vence prefixo curto',
           (select component = 'uzapi-' from public.incident_component_info('uzapi-health-check'))
    union all
    select 'F3 componente fora do catalogo segue devolvendo zero linhas',
           not exists (select 1 from public.incident_component_info('componente-que-nao-existe'))

    -- ── G. a trava do analisador parado continua de pe ───────────────────────
    union all
    select 'G1 dedupe por fingerprint no registro do incidente',
           (select p.prosrc like '%v_fingerprint := public.incident_fingerprint%'
              and p.prosrc like '%on conflict (fingerprint)%'
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'incident_record')
    union all
    select 'G2 no maximo um aviso por hora',
           (select coalesce(incident_notify_cooldown_min, 60) >= 60
              from public.llm_platform_settings limit 1)
    union all
    select 'G3 claim e portao respeitam o intervalo entre avisos',
           (select bool_and(prosrc like '%incident_notify_cooldown_min%') from src
             where proname in ('incident_claim_for_notification', 'incident_notify_pending_count'))
    union all
    select 'G4 analisador parado segue indo ao WhatsApp',
           (select somente_painel = false and severidade_padrao = 'alta'
              from public.incident_component_info('monitoramento:analise-indisponivel'))
)
select item, ok from checagens order by ok, item;
