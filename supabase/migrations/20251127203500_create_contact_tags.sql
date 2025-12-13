create table public.contact_tags (
  id uuid not null default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (id),
  unique (contact_id, tag_id)
);

-- RLS Policies
alter table public.contact_tags enable row level security;

create policy "Users can view their own contact tags"
  on public.contact_tags for select
  using (
    exists (
      select 1 from public.tags
      where tags.id = contact_tags.tag_id
      and tags.user_id = auth.uid()
    )
  );

create policy "Users can insert their own contact tags"
  on public.contact_tags for insert
  with check (
    exists (
      select 1 from public.tags
      where tags.id = contact_tags.tag_id
      and tags.user_id = auth.uid()
    )
  );

create policy "Users can delete their own contact tags"
  on public.contact_tags for delete
  using (
    exists (
      select 1 from public.tags
      where tags.id = contact_tags.tag_id
      and tags.user_id = auth.uid()
    )
  );
