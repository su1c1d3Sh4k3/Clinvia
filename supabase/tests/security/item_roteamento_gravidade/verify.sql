-- Teste do roteamento por gravidade (20260923350000).
--
-- Uma unica instrucao de proposito: o `supabase db query` devolve so o ultimo
-- result set, entao teste em varios selects perde os primeiros em silencio.
--
-- NAO chama incident_claim_for_notification em lugar nenhum: ela RESERVA o
-- incidente por 5 minutos e o teste atrasaria alerta de verdade. As condicoes
-- dela sao conferidas no texto da funcao (pg_proc.prosrc).
--
-- Rodar:  npx supabase db query --linked --file supabase/tests/security/item_roteamento_gravidade/verify.sql
-- Esperado: todas as linhas com ok = true.

with
src as (
    select p.proname, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('incident_claim_for_notification', 'incident_notify_pending_count',
                         'incident_summary_pending', 'invoke_alert_summary')
),
checagens as (

    -- ── A. privilegio ────────────────────────────────────────────────────────
    select 'A1 resumo negado a anon' as item,
           has_function_privilege('anon', 'public.incident_summary_pending(integer)', 'EXECUTE') = false as ok
    union all
    select 'A2 resumo negado a authenticated',
           has_function_privilege('authenticated', 'public.incident_summary_pending(integer)', 'EXECUTE') = false
    union all
    select 'A3 resumo liberado a service_role',
           has_function_privilege('service_role', 'public.incident_summary_pending(integer)', 'EXECUTE') = true
    union all
    select 'A4 invocador do resumo negado a anon',
           has_function_privilege('anon', 'public.invoke_alert_summary()', 'EXECUTE') = false
    union all
    select 'A5 invocador do resumo negado a authenticated',
           has_function_privilege('authenticated', 'public.invoke_alert_summary()', 'EXECUTE') = false
    union all
    select 'A6 resolvedor de catalogo segue negado a anon',
           has_function_privilege('anon', 'public.incident_component_info(text)', 'EXECUTE') = false

    -- ── B. o defeito: media/baixa saiam na hora ──────────────────────────────
    union all
    -- Atualizado em 24/09: desde 23/09 o corte usa a gravidade EFETIVA, nao a
    -- coluna crua. Ler `ai_severity` direto ignorava o piso do catalogo e
    -- segurava critico enquanto o analisador estivesse fora do ar. O verify
    -- continuou cobrando o texto velho e acusava falso negativo — invisivel,
    -- porque so rodava no dia em que nasceu.
    select 'B1 claim exige critica ou alta',
           (select prosrc like '%incident_severidade_efetiva(i.component, i.ai_severity)%'
                   and prosrc like '%(''critica'', ''alta'')%' from src
             where proname = 'incident_claim_for_notification')
    union all
    -- a condicao velha era uma DISJUNCAO: "analisado OU (critica/alta e 2 min)".
    -- Era o "ou" que deixava qualquer media analisada passar.
    select 'B2 disjuncao antiga sumiu do claim',
           (select prosrc not like '%or (i.ai_severity in (''critica'', ''alta'')%' from src
             where proname = 'incident_claim_for_notification')
    union all
    select 'B3 portao exige critica ou alta',
           (select prosrc like '%incident_severidade_efetiva(i.component, i.ai_severity)%'
                   and prosrc like '%(''critica'', ''alta'')%' from src
             where proname = 'incident_notify_pending_count')
    union all
    select 'B4 disjuncao antiga sumiu do portao',
           (select prosrc not like '%or (i.ai_severity in (''critica'', ''alta'')%' from src
             where proname = 'incident_notify_pending_count')
    union all
    -- portao e claim divergirem produz alerta que nunca sai (portao mudo) ou
    -- function acordada de minuto em minuto para nada (portao barulhento)
    select 'B5 claim e portao filtram por somente_painel os dois',
           (select bool_and(prosrc like '%somente_painel%') from src
             where proname in ('incident_claim_for_notification', 'incident_notify_pending_count'))

    -- ── C. o caminho agrupado, que nao existia ───────────────────────────────
    union all
    -- O MINUTO nao entra na checagem de proposito: 20260924230000 espalhou os
    -- crons para fora do :00 justamente porque a concorrencia no minuto cheio
    -- estourava a folga de conexao do banco. Fixar o minuto aqui faria a proxima
    -- recalibragem reprovar um acerto.
    select 'C1 cron alert-summary agendado e ativo de 2 em 2 horas',
           exists (select 1 from cron.job
                    where jobname = 'alert-summary' and active and schedule like '% */2 * * *')
    union all
    select 'C2 invocador do resumo tem portao de fila vazia',
           (select prosrc like '%incident_summary_pending(2)%' and prosrc like '%return;%' from src
             where proname = 'invoke_alert_summary')
    union all
    select 'C3 invocador do resumo le a chave nova do vault',
           (select prosrc like '%SUPABASE_EDGE_SECRET_KEY%' and prosrc like '%x-service-key%' from src
             where proname = 'invoke_alert_summary')
    union all
    select 'C4 invocador do resumo dispara rastreado',
           (select prosrc like '%clinvia_http_post%' and prosrc like '%cron:alert-summary%' from src
             where proname = 'invoke_alert_summary')
    union all
    -- O ramo `ai_severity is null` deixou de existir porque deixou de ser
    -- preciso: o resumo passou a cortar pela gravidade EFETIVA, e efetiva de
    -- nulo nunca e nula (cai no piso do catalogo, default media). O buraco que
    -- esta checagem existe para impedir — incidente sem gravidade nao ir a lugar
    -- nenhum — agora se prova assim.
    select 'C5 severidade nula tem caminho (cai no resumo)',
           (select prosrc like '%incident_severidade_efetiva%' from src
             where proname = 'incident_summary_pending')
           and public.incident_severidade_efetiva('zzz:inexistente', null) is not null

    -- ── D. os dois caminhos nao se cruzam nem deixam buraco ──────────────────
    union all
    -- se um critica aparecesse no resumo, ele seria avisado duas vezes
    select 'D1 nenhum critica/alta entra no resumo',
           not exists (select 1 from public.incident_summary_pending(24) s
                        join public.incidents i on i.id = s.id
                       where i.ai_severity in ('critica', 'alta'))
    union all
    select 'D2 nenhum resolvido entra no resumo',
           not exists (select 1 from public.incident_summary_pending(24) s
                        join public.incidents i on i.id = s.id
                       where i.status = 'resolved')

    -- ── E. manutencao interna nao vira mensagem ──────────────────────────────
    union all
    select 'E1 componente-nao-catalogado marcado somente_painel',
           (select somente_painel from public.incident_component_info('monitoramento:componente-nao-catalogado'))
    union all
    select 'E2 ele nao entra no resumo',
           not exists (select 1 from public.incident_summary_pending(24)
                        where component = 'monitoramento:componente-nao-catalogado')
    union all
    -- a marca e excecao, nao regra: se ela vazar para um componente de operacao,
    -- o alerta dele fica mudo para sempre e ninguem percebe
    -- Era `count(*) = 1` e virou lista nominal: quatro marcas novas entraram
    -- por decisao (teste, simulacao, erro de entrada do chamador, erro de tela),
    -- e contar so avisaria que o numero mudou, sem dizer QUEM. O que precisa
    -- falhar e componente de OPERACAO ganhando a marca — esse fica mudo para
    -- sempre e ninguem percebe.
    select 'E3 somente_painel so nos componentes que foram decididos assim',
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
                                        'template-sends:log',
                                        -- 25/09/2026: as duas familias de recusa
                                        -- da Meta, por ordem nominal dele. Alerta
                                        -- so em defeito nosso, conta inteira ou
                                        -- VOLUME (envio:pico-diario, que fica
                                        -- fora do painel). Recusa avulsa por
                                        -- regra da Meta ja aparece na caixa
                                        -- vermelha do cartao, para o atendente.
                                        'envio:bloqueado-',
                                        'envio:rejeitado-',
                                        -- 25/09/2026: a sonda externa de login. O
                                        -- painel aqui nao e supressao: a sentinela
                                        -- mora FORA e ja mandou o WhatsApp dela
                                        -- direto pela Meta. O gemeo
                                        -- `sentinela:parou-de-reportar` fica fora
                                        -- desta lista: quando ele dispara a
                                        -- sentinela esta muda, e nao ha 2a via.
                                        'sentinela:aplicacao-inacessivel',
                                        -- 26/09/2026: instancia que existe na
                                        -- UAZAPI e nao tem linha em
                                        -- public.instances. Divida de CADASTRO,
                                        -- nao incidente de operacao: as 9
                                        -- medidas sao restos de 2026-03 a
                                        -- 2026-06 e nada esta caindo agora por
                                        -- causa delas. Teto baixa pelo mesmo
                                        -- motivo do par instancia-desconectada:
                                        -- sem ele a IA promoveria um resto de
                                        -- marco a alarme de madrugada.
                                        'uazapi:instancia-orfa',
                                        -- 26/09/2026, REGRA GERAL dele: problema
                                        -- de conta ou conexao do CLIENTE vira
                                        -- aviso no front dele, com a acao a
                                        -- tomar; aqui, no maximo painel. O
                                        -- criterio e QUEM PODE AGIR, nao a
                                        -- gravidade: ninguem deste lado reconecta
                                        -- o Instagram por OAuth, reabre a sessao
                                        -- do WhatsApp nem tira a conta da clinica
                                        -- da lista de barradas da Meta. Os dois
                                        -- varredores e o `meta:fora_do_ar` entram
                                        -- porque nao ha acao nenhuma: terceiro
                                        -- caido volta sozinho pela fila de
                                        -- reenvio. Nada foi desligado — segue
                                        -- tudo gravado e visivel no painel, e o
                                        -- contrapeso `instagram:renovacao-falhou`
                                        -- (defeito NOSSO) ficou fora desta lista
                                        -- de proposito, para continuar tocando.
                                        'instagram:token-vencido',
                                        'uazapi:instancia-desconectada',
                                        'meta:instancia-desconectada',
                                        'uazapi:varredura-cega',
                                        'uazapi:remocao-pendente',
                                        'uzapi-instancias-orfas',
                                        'meta:fora_do_ar',
                                        'envio:conta-')
           )
    union all
    select 'E4 analise-indisponivel continua indo ao WhatsApp',
           (select somente_painel = false from public.incident_component_info('monitoramento:analise-indisponivel'))
    union all
    -- defeito 4: recado de desenvolvedor fora da mensagem de operacao
    select 'E5 catalogo sem instrucao de cadastro na descricao',
           not exists (select 1 from public.incident_component_catalog
                        where is_active and descricao ilike '%cadastre%')

    -- ── F. o catalogo nao regrediu com o drop/create do resolvedor ───────────
    union all
    select 'F1 resolvedor ainda resolve exato e prefixo',
           (select i1.natureza = 'detector' and i2.natureza = 'detector'
              from public.incident_component_info('openai:sync_failure') i1,
                   public.incident_component_info('openai:um_kind_que_nao_existe') i2)
    union all
    select 'F2 componente fora do catalogo segue devolvendo zero linhas',
           not exists (select 1 from public.incident_component_info('componente-que-nao-existe'))
)
select item, ok from checagens order by ok, item;
