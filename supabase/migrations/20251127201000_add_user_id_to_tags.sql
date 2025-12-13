-- Truncate table to avoid null constraint issues with existing data
truncate table public.tags;

-- Add user_id column
alter table public.tags 
add column user_id uuid not null references public.profiles(id);

-- Drop existing policies
drop policy if exists "Enable read access for all users" on public.tags;
drop policy if exists "Enable insert for authenticated users" on public.tags;
drop policy if exists "Enable update for authenticated users" on public.tags;
drop policy if exists "Enable delete for authenticated users" on public.tags;

-- Create new policies enforcing user ownership
create policy "Users can view their own tags"
on public.tags for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own tags"
on public.tags for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own tags"
on public.tags for update
to authenticated
using (auth.uid() = user_id);

create policy "Users can delete their own tags"
on public.tags for delete
to authenticated
using (auth.uid() = user_id);
