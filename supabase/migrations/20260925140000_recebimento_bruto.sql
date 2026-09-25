-- Recebimento durável: nada que a Meta nos entregou pode sumir.
--
-- O caminho da Meta nunca teve fila. `meta-webhook` normalizava em memória,
-- chamava `webhook-handle-message` e DESCARTAVA a resposta, devolvendo 200 para
-- a Meta em qualquer cenário. Um timeout de banco (57014) na criação do contato
-- ou da conversa fazia o handler cair num `if` sem `else`, responder 200
-- "Processed" e a mensagem do paciente deixava de existir — sem retentativa,
-- sem alerta, com o provedor convencido de que entregou.
--
-- Esta migration arma as três coisas que faltavam no banco:
--   1. `webhook_queue.body_sha256` + índice único parcial: o corpo bruto da Meta
--      é gravado ANTES de qualquer processamento, e uma reentrega do MESMO corpo
--      conflita em vez de virar segunda linha.
--   2. Catálogo de incidente para a família `recebimento:` — crítica e NÃO
--      `somente_painel`, porque mensagem de paciente perdida avisa na primeira
--      ocorrência (o claim já manda a primeira individual, e rajada nunca
--      agrupa crítica).
--   3. A tarefa agendada que faltava: NADA acordava o `webhook-queue-processor`.
--      O único invocador era o `webhook-queue-receiver` (UAZAPI), logo uma linha
--      deixada em `pending` só era drenada quando o próximo webhook da UAZAPI
--      aparecesse. Sem tráfego UAZAPI, a retentativa nunca acontecia.

-- Regra desta casa: migration em produção falha em vez de travar o tráfego vivo.
set lock_timeout = '5s';
set statement_timeout = '120s';

-- ── 1. Identidade do corpo bruto ────────────────────────────────────────────

alter table public.webhook_queue
    add column if not exists body_sha256 text;

comment on column public.webhook_queue.body_sha256 is
    'SHA-256 do corpo BRUTO recebido do provedor. Só o caminho da Meta preenche. '
    'Serve de chave de idempotência na PORTA: reentrega do mesmo corpo conflita '
    'no índice único e não vira segunda linha. A janela de dedupe é a da limpeza '
    '(cleanup-webhook-queue-daily, 3 dias), o que basta porque a Meta desiste '
    'muito antes disso.';

create unique index if not exists idx_webhook_queue_body_sha256
    on public.webhook_queue (body_sha256)
    where body_sha256 is not null;

-- ── 2. Catálogo de incidentes ───────────────────────────────────────────────

insert into public.incident_component_catalog
    (component, match_tipo, natureza, severidade_padrao, somente_painel, descricao, acao_padrao)
values
(
    'recebimento:perdida-',
    'prefixo',
    'detector',
    'critica',
    false,
    'Mensagem que o provedor ENTREGOU e que não virou conversa. O texto depois do '
    'hífen diz onde o caminho parou (sem-contato = o cadastro do contato não pôde '
    'ser criado; sem-conversa = o contato existe mas a conversa não pôde ser '
    'criada) e a instância está entre parênteses. Antes de 25/09/2026 isso era '
    'invisível: o handler respondia 200 "Processed" e o provedor considerava '
    'entregue. Hoje o handler responde erro, a linha bruta fica na fila e um '
    'worker reprocessa — este incidente existe para avisar que houve perda '
    'ANTES de o worker conseguir, não para substituí-lo.',
    'Trate como perda de mensagem de paciente até provar o contrário. Confira a '
    'saúde do banco na janela (57014 = timeout de statement costuma vir em rajada '
    'e junto de migration ou pico) e a fila webhook_queue: a linha bruta com '
    'status pending é a mesma mensagem esperando retentativa. Se ela chegou a '
    'done depois, a mensagem entrou e o estrago foi só atraso; se ficou failed, '
    'a mensagem se perdeu de fato e o cliente precisa saber.'
),
(
    'recebimento:nao-gravado',
    'exato',
    'detector',
    'critica',
    false,
    'O webhook não conseguiu nem gravar o corpo bruto na fila de entrada. É a '
    'falha mais grave do caminho de recebimento: sem a linha bruta não há o que '
    'reprocessar, então a mensagem depende inteiramente de o processamento em '
    'linha ter dado certo — e se o banco recusou a escrita mais simples que '
    'existe, provavelmente não deu.',
    'Olhe a saúde do banco imediatamente (conexões, statement_timeout, locks). '
    'Enquanto isto aparece, TODA mensagem recebida pela Meta está sem rede de '
    'segurança.'
)
on conflict (component) do update set
    match_tipo        = excluded.match_tipo,
    natureza          = excluded.natureza,
    severidade_padrao = excluded.severidade_padrao,
    somente_painel    = excluded.somente_painel,
    descricao         = excluded.descricao,
    acao_padrao       = excluded.acao_padrao,
    is_active         = true,
    updated_at        = now();

-- ── 3. A tarefa agendada que nunca existiu ──────────────────────────────────

create or replace function public.invoke_webhook_queue_processor()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_url  text;
    v_jwt  text;
    v_edge text;
begin
    -- Só acorda a function quando há o que drenar. O caminho feliz (UAZAPI
    -- chamando o processor na chegada) já esvaziou a fila; esta tarefa é a rede
    -- de segurança da RETENTATIVA, não o caminho principal.
    if not exists (
        select 1 from public.webhook_queue
        where status = 'pending' and coalesce(attempts, 0) < coalesce(max_attempts, 3)
        limit 1
    ) then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'webhook-queue-processor',
        p_origem  := 'cron:webhook-queue-drain',
        p_url     := v_url || '/functions/v1/webhook-queue-processor',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := '{}'::jsonb,
        p_timeout := 20000
    );
exception when others then
    raise warning 'invoke_webhook_queue_processor: %', sqlerrm;
end;
$function$;

-- `create function` concede EXECUTE a PUBLIC; revoke de anon/authenticated NÃO
-- tira a concessão de PUBLIC.
revoke all on function public.invoke_webhook_queue_processor() from public, anon, authenticated;
grant execute on function public.invoke_webhook_queue_processor() to postgres, service_role;

select cron.unschedule('webhook-queue-drain')
where exists (select 1 from cron.job where jobname = 'webhook-queue-drain');

select cron.schedule(
    'webhook-queue-drain',
    '* * * * *',
    $$select public.invoke_webhook_queue_processor()$$
);
