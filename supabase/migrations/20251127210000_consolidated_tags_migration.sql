-- Enable moddatetime extension if not exists
create extension if not exists moddatetime schema extensions;

-- Create tags table
create table if not exists public.tags (
  id uuid not null default gen_random_uuid (),
  name text not null,
  color text not null default '#000000'::text,
  is_active boolean not null default true,
  user_id uuid not null references public.profiles(id),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint tags_pkey primary key (id)
);

-- Enable RLS on tags
alter table public.tags enable row level security;

-- Create policies for tags
drop policy if exists "Users can view their own tags" on public.tags;
create policy "Users can view their own tags"
on public.tags for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own tags" on public.tags;
create policy "Users can insert their own tags"
on public.tags for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own tags" on public.tags;
create policy "Users can update their own tags"
on public.tags for update
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can delete their own tags" on public.tags;
create policy "Users can delete their own tags"
on public.tags for delete
to authenticated
using (auth.uid() = user_id);

-- Create updated_at trigger for tags
drop trigger if exists handle_updated_at on public.tags;
create trigger handle_updated_at before update on public.tags
  for each row execute procedure moddatetime (updated_at);

-- Create contact_tags table
create table if not exists public.contact_tags (
  id uuid not null default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (id),
  unique (contact_id, tag_id)
);

-- Enable RLS on contact_tags
alter table public.contact_tags enable row level security;

-- Create policies for contact_tags
drop policy if exists "Users can view their own contact tags" on public.contact_tags;
create policy "Users can view their own contact tags"
  on public.contact_tags for select
  using (
    exists (
      select 1 from public.tags
      where tags.id = contact_tags.tag_id
      and tags.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert their own contact tags" on public.contact_tags;
create policy "Users can insert their own contact tags"
  on public.contact_tags for insert
  with check (
    exists (
      select 1 from public.tags
      where tags.id = contact_tags.tag_id
      and tags.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own contact tags" on public.contact_tags;
create policy "Users can delete their own contact tags"
  on public.contact_tags for delete
  using (
    exists (
      select 1 from public.tags
      where tags.id = contact_tags.tag_id
      and tags.user_id = auth.uid()
    )
  );
