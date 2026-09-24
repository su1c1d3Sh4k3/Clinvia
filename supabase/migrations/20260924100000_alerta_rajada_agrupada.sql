-- ============================================================================
-- Item 4 do plano de monitoramento: teto de 5 mensagens/dia.
--
-- Medicao que motivou (serie de 22/09 21:55 a 23/09 19:00, 21h05):
--   33 mensagens de WhatsApp = 37,5/dia. Onde elas nasceram:
--     - 8 mensagens no MESMO MINUTO (23/09 12:05) — uma varredura do
--       `cron-health-watch` que achou 8 crons quebrados. Oito WhatsApps, uma
--       causa raiz.
--     - 4 mensagens em 09:51-09:57, mesma historia.
--     - 3 mensagens de `simulacao-de-alerta` (ensaio meu) que chegaram no
--       telefone dele porque o componente NAO era `somente_painel` e a IA
--       avaliou o ensaio como `critica`. E exatamente o que a regra do aviso
--       previo existe para impedir: alerta vermelho que era teste ensina que
--       vermelho pode ser ignorado.
--     - 3 mensagens de `n8n:AUT - CRIACAO DE FLUXO` em 4 minutos (ele editando
--       o proprio no).
--
-- Duas mudancas, as duas reversiveis:
--   1) `rajada`: quando o despachante puxa 3+ incidentes NAO-criticos na mesma
--      passada, eles viram UMA mensagem com a lista. `critica` nunca entra na
--      rajada — continua saindo individual, sempre.
--   2) o ensaio de alerta vira `somente_painel`, como manda a regra escrita.
--
-- O que NAO muda: nenhum incidente deixa de ser registrado, nenhum deixa de
-- aparecer no painel. Muda quantas vezes o telefone toca, nao o que e sabido.
-- ============================================================================

-- ── 1) `kind = 'rajada'` precisa caber na restricao ────────────────────────
-- Em 23/09 o `skipped_severity` falhou 23514 em silencio por nao estar aqui.
-- Toda linha que o codigo escreve tem que estar nesta lista ANTES do deploy.
alter table public.incident_notifications
    drop constraint if exists incident_notifications_kind_check;

alter table public.incident_notifications
    add constraint incident_notifications_kind_check
    check (kind = any (array['individual','resumo','recorrencia','canal','rajada']));

-- ── 2) chaves de ajuste, sem deploy ────────────────────────────────────────
alter table public.llm_platform_settings
    add column if not exists alert_rajada_enabled boolean not null default true,
    add column if not exists alert_rajada_min     integer not null default 3;

comment on column public.llm_platform_settings.alert_rajada_min is
    'A partir de quantos incidentes nao-criticos na mesma passada do despachante '
    'eles viram uma unica mensagem. 1 e 2 continuam saindo individuais porque '
    'agrupar dois nao economiza nada e perde o detalhe.';

-- ── 3) o ensaio de alerta fica no painel ───────────────────────────────────
-- Piso `baixa` nao segurava nada: a gravidade efetiva e o PIOR entre o piso e a
-- avaliacao da IA, e a IA leu o texto do ensaio e disse `critica`. Quem segura o
-- telefone e `somente_painel`, sempre foi.
update public.incident_component_catalog
   set somente_painel = true,
       updated_at     = now()
 where component = 'simulacao-de-alerta';
