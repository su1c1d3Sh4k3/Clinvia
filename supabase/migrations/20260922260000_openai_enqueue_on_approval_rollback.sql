-- Rollback da 20260922260000: volta o trigger ao formato da 20260922132000
-- (AFTER INSERT puro, sem recorte de role/status).
--
-- Nao remove linha nenhuma de openai_provision_queue: job pendente continua
-- valido e o worker segue governado por provisioning_enabled.

create or replace function public.enqueue_openai_provision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
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
