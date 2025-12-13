-- Enable moddatetime extension
create extension if not exists moddatetime schema extensions;

create table public.tags (
  id uuid not null default gen_random_uuid (),
  name text not null,
  color text not null default '#000000'::text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint tags_pkey primary key (id)
);

-- Add RLS policies
alter table public.tags enable row level security;

create policy "Enable read access for all users"
on public.tags for select
to authenticated
using (true);

create policy "Enable insert for authenticated users"
on public.tags for insert
to authenticated
with check (true);

create policy "Enable update for authenticated users"
on public.tags for update
to authenticated
using (true);

create policy "Enable delete for authenticated users"
on public.tags for delete
to authenticated
using (true);

-- Create updated_at trigger
create trigger handle_updated_at before update on public.tags
  for each row execute procedure moddatetime (updated_at);
