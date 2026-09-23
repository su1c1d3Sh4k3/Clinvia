-- ============================================================
-- Monitoramento — origem nunca mais pode ser nula
--
-- Achado da conferencia de 7 dias: 1 evento em 223 ficou com `origem` NULA e,
-- pior, com `origem_inferida = false` — ou seja, um vazio se apresentando como
-- declaracao. O incidente-pai dele esta correto (`ia_n8n`, inferido), entao
-- ninguem leu nada errado; o resto do historico tambem esta inteiro.
--
-- A causa nao foi a regra de inferencia, que funciona: foi a JANELA entre
-- 20260923450000 (colunas criadas) e 20260923460000 (inferencia + backfill).
-- Um evento entrou no meio, depois do backfill ter passado e antes do
-- `incident_record` novo estar no lugar. Backfill unico so limpa o que ja
-- aconteceu — nao impede a proxima janela.
--
-- O que fecha de verdade e o CHECK. A 450000 escreveu `origem is null or
-- origem in (...)`, que aceita nulo de proposito para nao derrubar a ingestao
-- durante a propria migration. Cumprido esse papel, o nulo vira o que sempre
-- foi: ausencia de informacao fingindo ser informacao. `nao_identificada` e o
-- valor honesto para isso, e ja existe na lista.
--
-- Nao uso NOT NULL na coluna: o default cobre insert que esquece o campo, mas
-- um insert que manda `origem => null` explicitamente passaria pelo default e
-- morreria no NOT NULL, derrubando a ingestao do incidente. Perder o incidente
-- por causa do rotulo e trocar o problema grande pelo pequeno — a mesma razao
-- que ja esta escrita na 460000 para valor fora da lista. O par default +
-- CHECK sem nulo faz o insert explicito falhar cedo, no lugar certo.
-- ============================================================

-- ── 1. o residuo ────────────────────────────────────────────────────────────
-- Idempotente: sem linhas nulas, nao faz nada.
update public.incident_events
   set origem          = public.incident_origem_inferir(source, component),
       origem_inferida = true
 where origem is null;

update public.incidents
   set origem          = public.incident_origem_inferir(source, component),
       origem_inferida = true
 where origem is null;

-- ── 2. o default, para quem esquecer a coluna ───────────────────────────────
alter table public.incident_events
    alter column origem set default 'nao_identificada';

alter table public.incidents
    alter column origem set default 'nao_identificada';

-- ── 3. o CHECK sem nulo ─────────────────────────────────────────────────────
-- Recriado com o MESMO nome da 450000: e a mesma regra, so que sem a folga que
-- era necessaria durante a migration e deixou de ser depois dela.
alter table public.incident_events
    drop constraint if exists incident_events_origem_check;

alter table public.incident_events
    add constraint incident_events_origem_check
        check (origem in (
            'ia_n8n','front','webhook_externo','cron','edge_interna',
            'integracao_externa','nao_identificada'
        ));

alter table public.incidents
    drop constraint if exists incidents_origem_check;

alter table public.incidents
    add constraint incidents_origem_check
        check (origem in (
            'ia_n8n','front','webhook_externo','cron','edge_interna',
            'integracao_externa','nao_identificada'
        ));

comment on column public.incident_events.origem is
  'De onde veio a chamada que quebrou. Lista fechada de 7 valores, NUNCA nula desde 20260923480000 — ausencia de informacao e nao_identificada, que e contavel, e nao vazio, que se esconde. Declarada via header x-origin ou inferida por incident_origem_inferir; quem diz qual das duas e origem_inferida.';

comment on column public.incidents.origem is
  'Origem herdada do primeiro evento do incidente. Mesma lista fechada, tambem sem nulo. E esta que o alerta le — o evento fica no painel, o incidente e que vira mensagem.';
