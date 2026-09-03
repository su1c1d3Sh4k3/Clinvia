-- Convenios: cadastro por conta, servicos aptos, salas habilitadas e janela dedicada na sala.

-- 1. Convenios da conta
create table if not exists public.convenios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  descricao text,
  -- "Habilitar todos os convenios" e apenas UMA linha marcada assim: servicos
  -- aptos, salas e payload continuam passando pelas mesmas tabelas.
  is_catch_all boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.convenios
  add column if not exists is_catch_all boolean not null default false;

create unique index if not exists convenios_user_nome_uniq
  on public.convenios (user_id, public.clinvia_normalize_txt(nome)) where active;

create unique index if not exists convenios_user_catchall_uniq
  on public.convenios (user_id) where is_catch_all and active;

create index if not exists idx_convenios_user on public.convenios(user_id) where active;

-- 2. Servicos aptos para convenio (N:N com services_client)
create table if not exists public.convenio_servicos (
  convenio_id uuid not null references public.convenios(id) on delete cascade,
  service_client_id uuid not null references public.services_client(id) on delete cascade,
  primary key (convenio_id, service_client_id)
);

create index if not exists idx_convenio_servicos_service on public.convenio_servicos(service_client_id);

-- 3. Salas que atendem o convenio (N:N com professionals)
create table if not exists public.convenio_salas (
  convenio_id uuid not null references public.convenios(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  primary key (convenio_id, professional_id)
);

create index if not exists idx_convenio_salas_prof on public.convenio_salas(professional_id);

-- 4. Janela dedicada a convenio dentro da sala
alter table public.professionals
  add column if not exists convenio_enabled     boolean not null default false,
  add column if not exists convenio_all         boolean not null default true,
  add column if not exists convenio_days        integer[] not null default '{}',
  add column if not exists convenio_hours       jsonb,
  add column if not exists convenio_use_daily   boolean not null default false,
  add column if not exists convenio_hours_daily jsonb;

comment on column public.professionals.convenio_hours is 'Janela dedicada a convenio: {"start":"14:00","end":"16:00"}';
comment on column public.professionals.convenio_hours_daily is 'Janela por dia da semana: {"1":{"start":"14:00","end":"16:00"}}';
comment on column public.professionals.convenio_all is 'true = sala atende qualquer convenio (convenio_salas ignorada)';

-- 5. Marcacao do agendamento
-- (o switch "todos os convenios" vive em convenios.is_catch_all, nao em ia_config)
alter table public.ia_config
  drop column if exists convenio_all_enabled,
  drop column if exists convenio_all_descricao;

alter table public.appointments
  add column if not exists convenio_id uuid references public.convenios(id) on delete set null;

create index if not exists idx_appointments_convenio on public.appointments(convenio_id)
  where convenio_id is not null;

-- 6. RLS team-aware (get_owner_id, nunca auth.uid)
alter table public.convenios enable row level security;
alter table public.convenio_servicos enable row level security;
alter table public.convenio_salas enable row level security;

drop policy if exists "Team manage convenios" on public.convenios;
create policy "Team manage convenios" on public.convenios
  for all to authenticated
  using (user_id = (select public.get_owner_id()))
  with check (user_id = (select public.get_owner_id()));

drop policy if exists "Team manage convenio_servicos" on public.convenio_servicos;
create policy "Team manage convenio_servicos" on public.convenio_servicos
  for all to authenticated
  using (exists (select 1 from public.convenios c
                 where c.id = convenio_servicos.convenio_id
                   and c.user_id = (select public.get_owner_id())))
  with check (exists (select 1 from public.convenios c
                      where c.id = convenio_servicos.convenio_id
                        and c.user_id = (select public.get_owner_id())));

drop policy if exists "Team manage convenio_salas" on public.convenio_salas;
create policy "Team manage convenio_salas" on public.convenio_salas
  for all to authenticated
  using (exists (select 1 from public.convenios c
                 where c.id = convenio_salas.convenio_id
                   and c.user_id = (select public.get_owner_id())))
  with check (exists (select 1 from public.convenios c
                      where c.id = convenio_salas.convenio_id
                        and c.user_id = (select public.get_owner_id())));

-- 7. updated_at
create or replace function public.convenios_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists zz_convenios_touch on public.convenios;
create trigger zz_convenios_touch before update on public.convenios
  for each row execute function public.convenios_touch_updated_at();

-- 8. Migracao do legado ia_config.convenio -> convenios
-- Formato legado: blocos "N. Nome" seguidos de linhas "- Rotulo: valor".
-- Linhas de detalhe zeradas (R$ 0,00 / 0 dias) sao descartadas: virariam ruido no prompt.
do $$
declare
  cfg record;
  ln text;
  cur_nome text;
  cur_det text[];
begin
  for cfg in select user_id, convenio from public.ia_config
             where convenio is not null and btrim(convenio) <> ''
  loop
    cur_nome := null;
    cur_det := '{}';
    foreach ln in array string_to_array(replace(cfg.convenio, E'\r', ''), E'\n')
    loop
      ln := btrim(ln);
      if ln ~ '^\d+\.\s*\S' then
        if cur_nome is not null then
          insert into public.convenios (user_id, nome, descricao)
          values (cfg.user_id, cur_nome,
                  nullif(array_to_string(cur_det, E'\n'), ''))
          on conflict do nothing;
        end if;
        cur_nome := btrim(regexp_replace(ln, '^\d+\.\s*', ''));
        cur_det := '{}';
      elsif ln like '-%' and cur_nome is not null then
        ln := btrim(ltrim(ln, '- '));
        if ln <> '' and ln !~ 'R\$\s*0,00' and ln !~ '\m0 dias\M' then
          cur_det := cur_det || ln;
        end if;
      end if;
    end loop;
    if cur_nome is not null then
      insert into public.convenios (user_id, nome, descricao)
      values (cfg.user_id, cur_nome, nullif(array_to_string(cur_det, E'\n'), ''))
      on conflict do nothing;
    end if;
  end loop;
end;
$$;
