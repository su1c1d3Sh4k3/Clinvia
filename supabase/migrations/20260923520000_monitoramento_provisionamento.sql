-- Etapa 4 do monitoramento: provisionamento de conta na OpenAI.
--
-- O provisionamento hoje e uma esteira de tres pecas, e nenhuma delas avisava
-- quando parava:
--
--   trigger `zz_profiles_enqueue_openai_provision`  (enfileira na aprovacao)
--        -> tabela `openai_provision_queue`
--        -> cron `openai-provision-worker` `*/5`   (cria projeto + chave)
--        -> `profiles.openai_project_id` / `openai_api_key_id` / `openai_token`
--
-- Se o worker quebra, a fila enche em silencio e a conta nova simplesmente nao
-- tem IA. Ninguem descobre ate o cliente reclamar que "a IA nao responde" — que
-- e o pior detector possivel, porque chega dias depois e pela boca de quem
-- pagou.
--
-- O que este arquivo acrescenta sao tres varreduras SQL puras, rodando de 15 em
-- 15 minutos, cada uma cobrindo um ponto diferente da esteira:
--
--   A. `provisionamento:erro`            o worker tentou e falhou, e gravou o
--                                        motivo em `profiles.openai_provision_error`
--   B. `provisionamento:fila-travada`    job vivo ha muito tempo, ou ja com
--                                        tentativas demais
--   C. `provisionamento:conta-sem-chave` conta de cliente ATIVA que passou da
--                                        carencia e continua sem projeto/chave
--
-- C e o alvo do pedido ("conta nova sem chave = alta"). A e B existem porque C
-- sozinho chega TARDE: ele so acende depois da carencia, e nao sabe dizer por
-- que. A e B acendem no minuto do defeito e ja trazem o texto do erro.
--
-- ---------------------------------------------------------------------------
-- DUAS ARMADILHAS QUE ESTA MIGRATION EVITA DE PROPOSITO
-- ---------------------------------------------------------------------------
--
-- 1. `profiles.status` vale 'ativo', NAO 'approved'. Escrevi a primeira versao
--    do detector contra 'approved' — os 10 perfis do banco estao em 'ativo', e
--    o detector teria ficado verde para sempre parecendo certo. Um monitor que
--    nunca acende e indistinguivel de um monitor que funciona; so a medicao
--    separa os dois.
--
-- 2. `role` importa mais que `status`. Ha 3 perfis ativos sem projeto e sem
--    chave neste banco — e os tres estao CERTOS assim: um e super-admin e dois
--    sao colaboradores (`agent`), que trabalham dentro da conta do dono e nao
--    tem projeto proprio na OpenAI. O proprio trigger de enfileiramento ja
--    filtra por `role = 'admin'`; o detector tem que filtrar igual, senao nasce
--    com 3 alertas falsos permanentes — exatamente o ruido que o plano manda
--    orcar antes de ligar qualquer coisa.
--
-- ---------------------------------------------------------------------------
-- ORCAMENTO DE RUIDO — medido, nao estimado
-- ---------------------------------------------------------------------------
-- Estado real do banco em 23/09/2026, com as regras acima aplicadas:
--
--   perfis com `openai_provision_error`      0
--   jobs de fila vivos (pending/processing)  0   (7 linhas, todas `done`)
--   contas `admin` ativas sem projeto/chave  0   (10 perfis: 7 admin, todos
--                                                 providos; 1 super-admin e
--                                                 2 agents, fora do escopo)
--
-- Nos ultimos 7 dias entrou 1 conta nova de cliente (`Ciencia que conecta`, em
-- 23/09 12:22:53). A linha da fila foi criada e concluida no MESMO segundo, ou
-- seja: com a carencia de 30 minutos deste arquivo, ela teria gerado zero
-- alerta. Orcamento projetado: 0 alertas/semana em operacao normal, e o
-- primeiro que aparecer significa defeito de verdade.
--
-- A carencia de 30 min nao e arredondamento: o worker roda `*/5` e tenta ate 5
-- vezes, entao 30 minutos e o ponto em que "ainda esta tentando" ja deixou de
-- ser explicacao plausivel.
--
-- Tudo aqui desliga por `llm_platform_settings.provisionamento_alert_enabled`.

-- ---------------------------------------------------------------------------
-- 1. Chaves de desligar e de calibrar
-- ---------------------------------------------------------------------------

alter table public.llm_platform_settings
    add column if not exists provisionamento_alert_enabled boolean not null default true,
    add column if not exists provisionamento_carencia_min  integer not null default 30,
    add column if not exists provisionamento_max_tentativas integer not null default 3;

comment on column public.llm_platform_settings.provisionamento_alert_enabled is
  'Liga/desliga as tres varreduras de provisionamento (provisionamento_scan).';
comment on column public.llm_platform_settings.provisionamento_carencia_min is
  'Minutos que uma conta admin ativa pode ficar sem projeto/chave antes de virar incidente. Piso saudavel: 3x o intervalo do worker (*/5).';
comment on column public.llm_platform_settings.provisionamento_max_tentativas is
  'A partir de quantas tentativas um job de fila e considerado travado mesmo que ainda esteja dentro da carencia.';

-- ---------------------------------------------------------------------------
-- 2. Catalogo dos tres componentes novos
-- ---------------------------------------------------------------------------
-- Os tres entram em `alta`, e nao em `media`: conta sem IA e defeito total e
-- silencioso para o cliente afetado, e o volume medido e zero — nao ha risco de
-- transformar o telefone dele em ruido. `critica` fica reservado para o que
-- derruba a plataforma inteira, nao uma conta.

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao, severidade_padrao, somente_painel)
values
    ('provisionamento:erro', 'exato', 'servico',
     'O worker de provisionamento tentou criar o projeto/chave da OpenAI para uma conta e falhou. O motivo exato fica em profiles.openai_provision_error e viaja no contexto do incidente.',
     'Ler o erro no contexto. Se for credencial (a chave de admin da OpenAI), corrigir o segredo e a fila retenta sozinha. Se for limite da organizacao na OpenAI, e preciso liberar quota antes de retentar.',
     'alta', false),

    ('provisionamento:fila-travada', 'exato', 'servico',
     'Existe job de provisionamento parado na fila: vivo alem da carencia ou com tentativas demais. Enquanto isso a conta correspondente esta sem IA.',
     'Conferir se o cron openai-provision-worker esta rodando e o que ele respondeu. O incidente traz o profile_id, o numero de tentativas e o ultimo erro.',
     'alta', false),

    ('provisionamento:conta-sem-chave', 'exato', 'servico',
     'Conta de cliente (role admin) ativa ha mais tempo que a carencia e ainda sem projeto e sem chave da OpenAI. E o sintoma final: a IA daquela conta nao funciona. Colaboradores e super-admin nao entram aqui de proposito — eles nao tem projeto proprio.',
     'Se nao houver job na fila, o enfileiramento nao aconteceu: reenfileirar manualmente inserindo em openai_provision_queue. Se houver, o defeito e do worker e o incidente de fila-travada esta aberto junto.',
     'alta', false)
on conflict (component) do update set
    natureza          = excluded.natureza,
    descricao         = excluded.descricao,
    acao_padrao       = excluded.acao_padrao,
    severidade_padrao = excluded.severidade_padrao,
    somente_painel    = excluded.somente_painel;

-- ---------------------------------------------------------------------------
-- 3. A varredura
-- ---------------------------------------------------------------------------

create or replace function public.provisionamento_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado      boolean;
    v_carencia    integer;
    v_max_tent    integer;
    v_reg         record;
    v_res         jsonb;
    v_erros       integer := 0;
    v_travados    integer := 0;
    v_sem_chave   integer := 0;
    -- Janela de deduplicacao. `incident_record` ignora request_id repetido, e a
    -- varredura roda a cada 15 min sobre a MESMA condicao persistente: sem esta
    -- chave horaria, uma conta quebrada geraria 4 eventos por hora para sempre.
    v_hora        text := to_char(now() at time zone 'UTC', 'YYYYMMDDHH24');
begin
    select coalesce(provisionamento_alert_enabled, true),
           greatest(coalesce(provisionamento_carencia_min, 30), 5),
           greatest(coalesce(provisionamento_max_tentativas, 3), 1)
      into v_ligado, v_carencia, v_max_tent
      from public.llm_platform_settings
     limit 1;

    if not coalesce(v_ligado, true) then
        return jsonb_build_object('ok', true, 'desligado', true);
    end if;

    -- ── A. o worker falhou e disse por que ───────────────────────────────────
    for v_reg in
        select p.id, coalesce(nullif(p.company_name, ''), '(conta sem nome)') as empresa,
               p.openai_provision_error as erro,
               (select q.attempts from public.openai_provision_queue q
                 where q.profile_id = p.id order by q.created_at desc limit 1) as tentativas
          from public.profiles p
         where p.role = 'admin'
           and p.status = 'ativo'
           and p.openai_provision_error is not null
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'provisioning',
                'component', 'provisionamento:erro',
                'route', 'criar_projeto_openai',
                'owner_id', v_reg.id,
                'error_name', 'openai_provision_error',
                'error_message', 'Provisionamento da conta "' || v_reg.empresa || '" falhou: '
                                 || left(v_reg.erro, 400),
                'error_description', 'Enquanto este erro nao for limpo, a conta fica sem projeto e sem chave propria na OpenAI — ou seja, sem IA.',
                'request_id', 'prov-erro:' || v_reg.id || ':' || v_hora,
                'context', jsonb_build_object(
                    'profile_id', v_reg.id,
                    'tentativas', v_reg.tentativas)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_erros := v_erros + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[provisionamento_scan] erro %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    -- ── B. job vivo demais, ou tentado demais ────────────────────────────────
    for v_reg in
        select q.id, q.profile_id, q.status, q.attempts, q.created_at, q.updated_at,
               coalesce(nullif(p.company_name, ''), '(conta sem nome)') as empresa,
               left(coalesce(q.last_error, '(sem erro registrado)'), 300) as erro
          from public.openai_provision_queue q
          left join public.profiles p on p.id = q.profile_id
         where q.status in ('pending', 'processing')
           and (q.created_at < now() - make_interval(mins => v_carencia)
                or q.attempts >= v_max_tent)
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'provisioning',
                'component', 'provisionamento:fila-travada',
                'route', 'openai_provision_queue',
                'owner_id', v_reg.profile_id,
                'error_name', 'provision_queue_stuck',
                'error_message', 'Job de provisionamento da conta "' || v_reg.empresa || '" preso em "'
                                 || v_reg.status || '" ha ' || round(extract(epoch from now() - v_reg.created_at) / 60)
                                 || ' min apos ' || v_reg.attempts || ' tentativa(s). Ultimo erro: ' || v_reg.erro,
                'error_description', 'O worker roda a cada 5 minutos. Job vivo muito alem disso significa worker parado, quebrado, ou retentando algo que nunca vai passar.',
                'request_id', 'prov-fila:' || v_reg.id || ':' || v_hora,
                'context', jsonb_build_object(
                    'job_id', v_reg.id,
                    'profile_id', v_reg.profile_id,
                    'status', v_reg.status,
                    'tentativas', v_reg.attempts,
                    'criado_em', v_reg.created_at,
                    'atualizado_em', v_reg.updated_at)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_travados := v_travados + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[provisionamento_scan] fila %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    -- ── C. o sintoma: conta de cliente ativa e sem IA ────────────────────────
    -- Os filtros repetem, um a um, os do trigger de enfileiramento. Se um dia
    -- as duas listas divergirem, este detector passa a acusar conta que o
    -- sistema nunca teve intencao de prover.
    for v_reg in
        select p.id, coalesce(nullif(p.company_name, ''), '(conta sem nome)') as empresa,
               p.created_at,
               exists (select 1 from public.openai_provision_queue q
                        where q.profile_id = p.id and q.status in ('pending', 'processing')) as tem_job
          from public.profiles p
         where p.role = 'admin'
           and p.status = 'ativo'
           and p.openai_project_id is null
           and p.openai_token is null
           and coalesce(p.openai_key_source, '') <> 'customer'
           and p.created_at < now() - make_interval(mins => v_carencia)
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'provisioning',
                'component', 'provisionamento:conta-sem-chave',
                'route', 'conta_ativa_sem_chave',
                'owner_id', v_reg.id,
                'error_name', 'conta_sem_chave_openai',
                'error_message', 'A conta "' || v_reg.empresa || '" esta ativa desde '
                                 || to_char(v_reg.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                                 || ' e continua sem projeto e sem chave da OpenAI. A IA dessa conta nao funciona.',
                'error_description', case
                    when v_reg.tem_job then 'Existe job na fila — o defeito esta no worker, nao no enfileiramento.'
                    else 'NAO existe job na fila: o enfileiramento nao aconteceu. Reenfileirar inserindo em openai_provision_queue.'
                end,
                'request_id', 'prov-sem-chave:' || v_reg.id || ':' || v_hora,
                'context', jsonb_build_object(
                    'profile_id', v_reg.id,
                    'ativa_desde', v_reg.created_at,
                    'tem_job_na_fila', v_reg.tem_job)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_sem_chave := v_sem_chave + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[provisionamento_scan] sem chave %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    return jsonb_build_object(
        'ok', true,
        'carencia_min', v_carencia,
        'incidentes', jsonb_build_object(
            'erro', v_erros,
            'fila_travada', v_travados,
            'conta_sem_chave', v_sem_chave)
    );
end;
$$;

comment on function public.provisionamento_scan() is
  'Etapa 4 do monitoramento: varre a esteira de provisionamento da OpenAI (erro gravado, fila travada, conta admin ativa sem chave). SQL puro, cron */15. Filtra role=admin igual ao trigger de enfileiramento — sem isso acusa super-admin e colaborador, que nao tem projeto proprio.';

-- `create function` concede EXECUTE a PUBLIC; `revoke from anon` sozinho nao
-- tira esse grant.
revoke all on function public.provisionamento_scan() from public, anon, authenticated;
grant execute on function public.provisionamento_scan() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Agendamento
-- ---------------------------------------------------------------------------
-- */15 e nao */5: as tres condicoes sao persistentes (nao sao eventos que
-- passam), entao varrer mais rapido nao antecipa nada alem do proprio ruido.

select cron.unschedule('provisionamento-scan')
 where exists (select 1 from cron.job where jobname = 'provisionamento-scan');

select cron.schedule('provisionamento-scan', '*/15 * * * *', 'select public.provisionamento_scan()');
