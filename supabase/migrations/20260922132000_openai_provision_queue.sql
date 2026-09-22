-- RASCUNHO — NAO APLICADO. Aguardando aprovacao do user (22/09/2026).
--
-- Etapa "projeto e chave OpenAI por conta", parte 3: fila de provisionamento.
--
-- Por que fila e nao chamada direta: a conta nasce por TRIGGER no banco
-- (handle_new_user em auth.users), que nao deve nem pode depender de HTTP para a
-- OpenAI. O trigger so ENFILEIRA; um worker (cron) chama a edge function
-- `provision-openai-project`. Assim a criacao da conta NUNCA falha por causa da
-- OpenAI, e a falha fica registrada para reprocessar.
--
-- NADA RETROATIVO: o trigger e AFTER INSERT, so pega conta NOVA, e
-- `llm_platform_settings.provisioning_enabled` nasce FALSE — o worker sai sem
-- fazer nada ate o user ligar. Contas existentes so pelo botao manual do Super
-- Admin, uma por uma.

create table if not exists public.openai_provision_queue (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','done','failed','skipped')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.openai_provision_queue enable row level security;

comment on table public.openai_provision_queue is
  'Fila de provisionamento do projeto OpenAI por conta. Consumida pelo cron openai-provision-worker, que so roda se llm_platform_settings.provisioning_enabled = true. RLS sem policy = so service_role.';

create unique index if not exists openai_provision_queue_pending_uidx
  on public.openai_provision_queue (profile_id)
  where status in ('pending','processing');

create index if not exists openai_provision_queue_status_idx
  on public.openai_provision_queue (status, created_at);

create or replace function public.enqueue_openai_provision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- conta que ja chega com chave (import/admin) nao entra na fila
  if new.openai_token is not null or new.openai_project_id is not null then
    return new;
  end if;

  insert into public.openai_provision_queue (profile_id)
  values (new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists zz_profiles_enqueue_openai_provision on public.profiles;
create trigger zz_profiles_enqueue_openai_provision
  after insert on public.profiles
  for each row
  execute function public.enqueue_openai_provision();

-- Claim atomico, no mesmo padrao das outras filas do projeto -------------------
create or replace function public.claim_openai_provision_jobs(p_limit integer default 5)
returns setof public.openai_provision_queue
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (select provisioning_enabled from public.llm_platform_settings) then
    return;
  end if;

  return query
  update public.openai_provision_queue q
  set status = 'processing', attempts = q.attempts + 1, updated_at = now()
  where q.id in (
    select q2.id from public.openai_provision_queue q2
    where q2.status = 'pending' and q2.attempts < 5
    order by q2.created_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  returning q.*;
end;
$$;

revoke all on function public.claim_openai_provision_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_openai_provision_jobs(integer) to service_role;
