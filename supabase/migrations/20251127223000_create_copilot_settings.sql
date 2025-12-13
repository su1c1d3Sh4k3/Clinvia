-- Create copilot settings table
create table if not exists public.copilot (
    user_id uuid not null references auth.users(id) on delete cascade primary key,
    about_company text,
    customer_profile text,
    personality text,
    humor_level text,
    products text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.copilot enable row level security;

-- Create policies
create policy "Users can view their own copilot settings"
    on public.copilot for select
    using (auth.uid() = user_id);

create policy "Users can insert their own copilot settings"
    on public.copilot for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own copilot settings"
    on public.copilot for update
    using (auth.uid() = user_id);

-- Create updated_at trigger
create extension if not exists moddatetime schema extensions;

create trigger handle_updated_at before update on public.copilot
  for each row execute procedure moddatetime (updated_at);
