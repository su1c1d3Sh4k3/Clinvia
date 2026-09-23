-- ============================================================
-- Monitoramento — conserto da 20260923480000 (dois defeitos meus)
--
-- A 480000 tentou fechar o nulo da origem com CHECK. Nao fechou, e ainda
-- quebrou a ingestao. Os dois erros valem estar escritos:
--
-- 1. CHECK NAO REJEITA NULO. `null = any(array[...])` nao da false, da NULL, e
--    constraint satisfeita e a que avalia TRUE **ou NULL**. Entao
--    `check (origem in (...))` aceita nulo alegremente — exatamente o que ela
--    foi criada para impedir. So descobri porque o teste tentava o insert de
--    verdade em vez de ler o texto da constraint.
--
--    Pior: no `incidents` o teste PASSOU, e passou pelo motivo errado. O insert
--    morria antes, em outra coluna NOT NULL, e meu handler contava isso como
--    "barrado". Asserção verde provando outra coisa e o unico tipo de teste que
--    e pior que nenhum.
--
-- 2. A 480000 REESCREVEU a lista do `incidents` SEM `multiplas`. Esse valor nao
--    e decorativo: o proprio `incident_record` grava `multiplas` quando os
--    eventos de um incidente discordam entre si. Ou seja, o primeiro incidente
--    com origens divergentes iria falhar na ingestao — eu teria derrubado a
--    coleta tentando arrumar o rotulo dela. Conferido em producao antes deste
--    arquivo: `update ... origem='multiplas'` = BARRADO.
--
-- A correcao muda a estrategia. Nulo nao vira ERRO, vira VALOR: um gatilho
-- troca null por `nao_identificada` antes de gravar. Coagir em vez de rejeitar
-- e o que mantem a regra de sempre — nao se perde um incidente por causa do
-- rotulo dele. O CHECK continua, agora explicito sobre o nulo, mas como rede de
-- protecao do gatilho, nao como porteiro da ingestao.
-- ============================================================

begin;

-- ── 1. o gatilho: nulo vira nao_identificada, nada se perde ─────────────────
create or replace function public.incident_origem_normalizar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- `nao_identificada` e sempre palpite, nunca declaracao: quem nao disse de
    -- onde veio nao pode constar como tendo dito.
    if new.origem is null then
        new.origem          := 'nao_identificada';
        new.origem_inferida := true;
    end if;
    return new;
end;
$$;

comment on function public.incident_origem_normalizar() is
  'Troca origem nula por nao_identificada antes de gravar. Existe porque CHECK nao rejeita NULL (null = any(...) avalia NULL, e NULL satisfaz a constraint) e porque derrubar a ingestao por causa do rotulo seria trocar o problema grande pelo pequeno.';

drop trigger if exists zz_incident_events_origem_norm on public.incident_events;
create trigger zz_incident_events_origem_norm
    before insert or update of origem on public.incident_events
    for each row execute function public.incident_origem_normalizar();

drop trigger if exists zz_incidents_origem_norm on public.incidents;
create trigger zz_incidents_origem_norm
    before insert or update of origem on public.incidents
    for each row execute function public.incident_origem_normalizar();

-- ── 2. os CHECK, agora explicitos sobre o nulo ──────────────────────────────
-- `origem is not null and origem = any(...)`: sem o primeiro termo a constraint
-- e decorativa. E o `incidents` recupera `multiplas`, que a 480000 comeu.
alter table public.incident_events
    drop constraint if exists incident_events_origem_check;
alter table public.incident_events
    drop constraint if exists incident_events_origem_chk;

alter table public.incident_events
    add constraint incident_events_origem_check
        check (origem is not null and origem = any (array[
            'ia_n8n','front','webhook_externo','cron','edge_interna',
            'integracao_externa','nao_identificada'
        ]));

alter table public.incidents
    drop constraint if exists incidents_origem_check;
alter table public.incidents
    drop constraint if exists incidents_origem_chk;

-- `multiplas` so existe no agregado: um incidente pode juntar eventos que
-- discordam, e essa discordancia por si so ja e informacao.
alter table public.incidents
    add constraint incidents_origem_check
        check (origem is not null and origem = any (array[
            'ia_n8n','front','webhook_externo','cron','edge_interna',
            'integracao_externa','nao_identificada','multiplas'
        ]));

commit;
