-- Reconciliacao REVERSA da UAZAPI: instancia no provedor sem linha no banco
-- =========================================================================
-- A reconciliacao que ja existia (`20260925...`, `uazapi:remocao-pendente`)
-- olha daqui para fora: a linha existe, o provedor recusou apagar, a linha FICA
-- marcada com `removal_pending_at`. Faltava o sentido contrario.
--
-- Medido em 26/09/2026: o provedor tem 11 instancias, `public.instances` tem 2.
-- As 9 restantes sao numeros de clinica num servidor que a gente paga e nao
-- controla — nao aparecem em tela nenhuma, ninguem monitora, e a cobranca do
-- provedor nao e zero so porque a linha sumiu do nosso banco. Duas origens
-- conhecidas: o force delete e o `admin-delete-client`, que nunca mencionou
-- `instances`.
--
-- SEVERIDADE BAIXA E SOMENTE PAINEL, com TETO baixa. Isto e divida de cadastro,
-- nao incidente de operacao: nada esta caindo agora por causa disso. O teto
-- existe porque `incident_severidade_efetiva` devolve o PIOR entre o piso do
-- catalogo e a `ai_severity`, e o analisador por IA roda a cada 2 min — sem
-- teto, bastaria ele achar grave um resto de 2026-03 para a classe inteira
-- comecar a tocar o telefone dele. E a mesma excecao ja acordada para
-- `{uazapi,meta}:instancia-desconectada`.
--
-- HORARIO DO CRON: 04:50 UTC (01:50 em Sao Paulo), uma vez por dia. O minuto
-- :50 e um dos quatro cujo pior caso ficava em 10 partidas, e as 04h e o vale
-- do dia — o `item_rajada_conexoes` recalcula o pico a partir de `cron.job` e
-- passa a contar este job tambem.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- ─── 1. Catalogo ────────────────────────────────────────────────────────────
insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao,
     severidade_padrao, severidade_teto, somente_painel, is_active)
values
    ('uazapi:instancia-orfa', 'exato', 'detector',
     'acusa instancia que existe na UAZAPI e nao tem linha em public.instances',
     'Nao e urgencia: e numero de clinica ligado a um servidor que pagamos e nao controlamos. '
     'O contexto do incidente traz nome, id e data de criacao no provedor. Decidir UMA das duas: '
     '(a) a instancia ainda serve alguem — recadastrar a linha em public.instances para ela voltar '
     'ao monitoramento e ao health-check; (b) nao serve — apagar no provedor, porque enquanto existir '
     'pode estar sendo cobrada. Antes de apagar, conferir o status: instancia CONECTADA tem numero de '
     'paciente do outro lado. As duas origens conhecidas sao o force delete e o admin-delete-client, '
     'que nao mencionava instances — se aparecer orfa NOVA, o vazamento voltou e e ali que se olha.',
     'baixa', 'baixa', true, true)
on conflict (component) do update
   set match_tipo        = excluded.match_tipo,
       natureza          = excluded.natureza,
       descricao         = excluded.descricao,
       acao_padrao       = excluded.acao_padrao,
       severidade_padrao = excluded.severidade_padrao,
       severidade_teto   = excluded.severidade_teto,
       somente_painel    = excluded.somente_painel,
       is_active         = true,
       updated_at        = now();

-- ─── 2. Acordador ───────────────────────────────────────────────────────────
-- Le a chave NOVA (`SUPABASE_EDGE_SECRET_KEY`). O `SUPABASE_SERVICE_ROLE_KEY`
-- do vault ainda e o JWT legado e a function o compararia com o proprio env,
-- que ja e `sb_secret_` — 401 com o cron dizendo `succeeded`. O `coalesce` e
-- rede de seguranca, nao alternativa.
create or replace function public.invoke_uzapi_instancias_orfas()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    v_url  text;
    v_jwt  text;
    v_edge text;
begin
    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'uzapi-instancias-orfas',
        p_origem  := 'cron:uzapi-orfas-scan',
        p_url     := v_url || '/functions/v1/uzapi-instancias-orfas',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := '{}'::jsonb,
        p_timeout := 40000
    );
exception when others then
    -- Um acordador que derruba o cron por causa de um vault fora do ar seria
    -- pior que a varredura nao rodar: `cron-health-watch` ja acusa o 4xx/5xx
    -- pelo `net._http_response`.
    raise warning '[invoke_uzapi_instancias_orfas] %', sqlerrm;
end;
$$;

comment on function public.invoke_uzapi_instancias_orfas() is
    'Acorda a reconciliacao reversa da UAZAPI (instancia no provedor sem linha em public.instances).';

revoke all on function public.invoke_uzapi_instancias_orfas() from public, anon, authenticated;
grant execute on function public.invoke_uzapi_instancias_orfas() to service_role;

-- ─── 3. Cron ────────────────────────────────────────────────────────────────
select cron.unschedule('uzapi-orfas-scan')
 where exists (select 1 from cron.job where jobname = 'uzapi-orfas-scan');

select cron.schedule(
    'uzapi-orfas-scan',
    '50 4 * * *',
    $cron$select public.invoke_uzapi_instancias_orfas();$cron$);
