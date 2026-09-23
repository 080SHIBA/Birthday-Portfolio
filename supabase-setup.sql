-- Run this once in Supabase Dashboard → SQL Editor.
-- The browser uses only the project's publishable key; RLS controls its access.
create table if not exists public.birthday_wishes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  message text not null check (char_length(message) between 1 and 280),
  audio_path text,
  created_at timestamptz not null default now()
);

alter table public.birthday_wishes enable row level security;
grant select, insert on public.birthday_wishes to anon;
drop policy if exists "Anyone can read birthday wishes" on public.birthday_wishes;
drop policy if exists "Anyone can add a birthday wish" on public.birthday_wishes;
create policy "Anyone can read birthday wishes" on public.birthday_wishes for select to anon using (true);
create policy "Anyone can add a birthday wish" on public.birthday_wishes for insert to anon with check (char_length(name) between 1 and 40 and char_length(message) between 1 and 280);

-- Starter wishes shown in the first guestbook view. They are inserted only once.
insert into public.birthday_wishes (name, message)
select 'James', 'May your year be filled with joy.'
where not exists (select 1 from public.birthday_wishes where name = 'James' and message = 'May your year be filled with joy.');
insert into public.birthday_wishes (name, message)
select 'Michael', 'Keep inspiring people.'
where not exists (select 1 from public.birthday_wishes where name = 'Michael' and message = 'Keep inspiring people.');

create table if not exists public.birthday_reactions (
  wish_id uuid not null references public.birthday_wishes(id) on delete cascade,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (wish_id, visitor_id)
);
alter table public.birthday_reactions enable row level security;
grant select, insert on public.birthday_reactions to anon;
drop policy if exists "Anyone can view birthday reactions" on public.birthday_reactions;
drop policy if exists "Anyone can add one birthday reaction" on public.birthday_reactions;
create policy "Anyone can view birthday reactions" on public.birthday_reactions for select to anon using (true);
create policy "Anyone can add one birthday reaction" on public.birthday_reactions for insert to anon with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('birthday-voices', 'birthday-voices', true, 5242880, array['audio/webm']) on conflict (id) do nothing;
drop policy if exists "Anyone can read birthday voice notes" on storage.objects;
drop policy if exists "Anyone can add birthday voice notes" on storage.objects;
create policy "Anyone can read birthday voice notes" on storage.objects for select to anon using (bucket_id = 'birthday-voices');
create policy "Anyone can add birthday voice notes" on storage.objects for insert to anon with check (bucket_id = 'birthday-voices');

do $$ begin alter publication supabase_realtime add table public.birthday_wishes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.birthday_reactions; exception when duplicate_object then null; end $$;
