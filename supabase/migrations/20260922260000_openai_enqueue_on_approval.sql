-- RASCUNHO — NAO APLICADO. Aguardando o OK do user (22/09/2026).
--
-- Etapa "projeto e chave OpenAI por conta", delta 1: a chave nasce na APROVACAO
-- da conta, nao em qualquer insert de profiles.
--
-- POR QUE ESTE ARQUIVO EXISTE
-- A 20260922132000 criou o trigger como AFTER INSERT puro. Medindo o fluxo real
-- (22/09/2026): o cadastro publico grava em `pending_signups` (Auth.tsx) e NAO
-- cria linha em profiles; a linha de profiles nasce dentro da edge function
-- `approve-client`, num upsert com `status = 'ativo'`. Ou seja: na maioria dos
-- casos o AFTER INSERT ja coincide com a aprovacao. Mas ele erra em tres pontos:
--
--   1. `approve-client` reaproveita o usuario de auth quando o e-mail ja existe
--      e faz `upsert ... on conflict (id)`. Se a linha de profiles ja existir
--      (corrida com handle_new_user, ou reaprovacao), o upsert vira UPDATE e o
--      trigger de INSERT nao dispara — conta aprovada sem chave, em silencio.
--   2. Reativar uma conta inativa (inativo -> ativo) nao enfileira nada.
--   3. O trigger enfileirava QUALQUER linha nova de profiles, inclusive as que
--      nao sao conta de cliente (super-admin, a linha `meta-review` com
--      role='agent'). Isso gastaria projeto na OpenAI para quem nao e tenant.
--
-- Depois deste arquivo o gatilho e "a conta esta ativa e e conta de cliente":
-- INSERT que ja nasce ativo, ou UPDATE que ACABOU de virar ativo.
--
-- NADA RETROATIVO: este arquivo nao enfileira conta existente, nao chama a
-- OpenAI e `llm_platform_settings.provisioning_enabled` continua FALSE — o
-- worker sai sem fazer nada. As contas de hoje so entram pelo provisionamento
-- manual, uma por uma, depois do OK do user.

create or replace function public.enqueue_openai_provision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- 1. So conta de CLIENTE (dono do tenant). super-admin e colaborador nao tem
  --    projeto proprio na OpenAI.
  if coalesce(new.role, '') <> 'admin' then
    return new;
  end if;

  -- 2. So conta APROVADA/ativa.
  if coalesce(new.status, '') <> 'ativo' then
    return new;
  end if;

  -- 3. No UPDATE, so na TRANSICAO para ativo. `update of status` dispara mesmo
  --    quando o valor nao muda (o upsert do approve-client reescreve o campo),
  --    e sem esta guarda cada UPDATE reenfileirava a mesma conta.
  if tg_op = 'UPDATE' and coalesce(old.status, '') = 'ativo' then
    return new;
  end if;

  -- 4. Quem ja tem chave/projeto, ou usa chave propria, fica de fora.
  if new.openai_token is not null or new.openai_project_id is not null then
    return new;
  end if;

  if new.openai_key_source = 'customer' then
    return new;
  end if;

  -- O indice unico parcial (status in pending/processing) garante 1 job vivo
  -- por conta; `on conflict do nothing` sem alvo cobre qualquer unique.
  insert into public.openai_provision_queue (profile_id)
  values (new.id)
  on conflict do nothing;

  return new;
end;
$$;

comment on function public.enqueue_openai_provision() is
  'Enfileira o provisionamento do projeto OpenAI quando a conta de cliente fica ATIVA (aprovacao em approve-client ou reativacao). Ignora super-admin/colaborador, conta que ja tem chave ou projeto e conta com chave propria (openai_key_source = customer).';

drop trigger if exists zz_profiles_enqueue_openai_provision on public.profiles;
create trigger zz_profiles_enqueue_openai_provision
  after insert or update of status on public.profiles
  for each row
  execute function public.enqueue_openai_provision();
