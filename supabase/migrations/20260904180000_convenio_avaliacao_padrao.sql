-- Avaliacao entra automaticamente em TODO convenio (regra do usuario).
-- A triagem e o que abre a porta do plano: quem cadastra um convenio nunca
-- precisa marcar as avaliacoes na mao, e elas nao podem ficar de fora por
-- esquecimento. Os gatilhos abaixo cobrem os dois sentidos (convenio novo /
-- avaliacao nova) e valem para qualquer caminho de escrita, nao so a tela.

-- 1. Convenio novo -> puxa todas as avaliacoes da conta
create or replace function public.convenio_link_avaliacoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.convenio_servicos (convenio_id, service_client_id)
  select new.id, sc.id
  from public.services_client sc
  join public.services_category cat on cat.id = sc.category_id
  where sc.user_id = new.user_id
    and public.clinvia_normalize_txt(cat.name) = 'avaliacao'
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists zz_convenios_link_avaliacoes on public.convenios;
create trigger zz_convenios_link_avaliacoes
  after insert on public.convenios
  for each row execute function public.convenio_link_avaliacoes();

-- 2. Avaliacao nova -> entra em todos os convenios ativos da conta
create or replace function public.avaliacao_link_convenios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.services_category cat
    where cat.id = new.category_id
      and public.clinvia_normalize_txt(cat.name) = 'avaliacao'
  ) then
    return new;
  end if;

  insert into public.convenio_servicos (convenio_id, service_client_id)
  select c.id, new.id
  from public.convenios c
  where c.user_id = new.user_id and c.active
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists zz_services_client_link_convenios on public.services_client;
create trigger zz_services_client_link_convenios
  after insert on public.services_client
  for each row execute function public.avaliacao_link_convenios();

-- 3. Backfill dos convenios que ja existem
insert into public.convenio_servicos (convenio_id, service_client_id)
select c.id, sc.id
from public.convenios c
join public.services_client sc on sc.user_id = c.user_id
join public.services_category cat on cat.id = sc.category_id
where c.active
  and public.clinvia_normalize_txt(cat.name) = 'avaliacao'
on conflict do nothing;
