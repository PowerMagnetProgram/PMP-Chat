-- Run this file in the Supabase SQL Editor.
-- Then replace the placeholders in js/supabase.js with your project URL and anon key.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  fullname text not null,
  email text not null,
  bio text default '',
  photo_url text default '',
  online boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz,
  last_seen timestamptz
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) > 0 and char_length(text) <= 800),
  type text not null default 'text' check (type in ('text', 'image', 'voice')),
  media_url text,
  media_path text,
  media_mime text,
  media_name text,
  duration_seconds integer,
  reply_to_id uuid references public.messages(id) on delete set null,
  read boolean default false,
  read_at timestamptz,
  created_at timestamptz default now(),
  constraint different_sender_receiver check (sender_id <> receiver_id)
);

alter table public.messages
  alter column text drop not null;

alter table public.messages
  add column if not exists type text not null default 'text',
  add column if not exists media_url text,
  add column if not exists media_path text,
  add column if not exists media_mime text,
  add column if not exists media_name text,
  add column if not exists duration_seconds integer,
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null;

do $$
begin
  alter table public.messages
    add constraint messages_type_check check (type in ('text', 'image', 'voice'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.messages
    add constraint messages_has_content_check check (
      (text is not null and char_length(text) > 0 and char_length(text) <= 800)
      or (media_url is not null and type in ('image', 'voice'))
    );
exception
  when duplicate_object then null;
end $$;

create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists messages_receiver_id_idx on public.messages(receiver_id);
create index if not exists messages_created_at_idx on public.messages(created_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, fullname, email, bio, photo_url, online)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'fullname', split_part(new.email, '@', 1), 'New User'),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'bio', 'No bio yet.'),
    coalesce(new.raw_user_meta_data->>'photo_url', ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.prevent_message_content_update()
returns trigger
language plpgsql
as $$
begin
  if old.sender_id <> new.sender_id
    or old.receiver_id <> new.receiver_id
    or old.text <> new.text
    or old.type <> new.type
    or old.media_url is distinct from new.media_url
    or old.media_path is distinct from new.media_path
    or old.media_mime is distinct from new.media_mime
    or old.media_name is distinct from new.media_name
    or old.duration_seconds is distinct from new.duration_seconds
    or old.reply_to_id is distinct from new.reply_to_id
    or old.created_at <> new.created_at then
    raise exception 'Only read status can be updated';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_message_content_update on public.messages;
create trigger prevent_message_content_update
before update on public.messages
for each row execute function public.prevent_message_content_update();

alter table public.profiles enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles are readable by authenticated users" on public.profiles;
create policy "profiles are readable by authenticated users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "participants can read messages" on public.messages;
create policy "participants can read messages"
on public.messages for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "users can send own messages" on public.messages;
create policy "users can send own messages"
on public.messages for insert
to authenticated
with check (
  auth.uid() = sender_id
  and (
    (text is not null and char_length(text) > 0 and char_length(text) <= 800)
    or (media_url is not null and type in ('image', 'voice'))
  )
);

drop policy if exists "receivers can mark messages read" on public.messages;
create policy "receivers can mark messages read"
on public.messages for update
to authenticated
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id and read = true);

drop policy if exists "senders can delete own messages" on public.messages;
create policy "senders can delete own messages"
on public.messages for delete
to authenticated
using (auth.uid() = sender_id);

alter table public.messages replica identity full;
alter table public.profiles replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('chat-media', 'chat-media', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "authenticated users can read avatars" on storage.objects;
create policy "authenticated users can read avatars"
on storage.objects for select
to authenticated
using (bucket_id = 'avatars');

drop policy if exists "users can upload own avatar" on storage.objects;
create policy "users can upload own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users can update own avatar" on storage.objects;
create policy "users can update own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "authenticated users can read chat media" on storage.objects;
create policy "authenticated users can read chat media"
on storage.objects for select
to authenticated
using (bucket_id = 'chat-media');

drop policy if exists "users can upload own chat media" on storage.objects;
create policy "users can upload own chat media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null;
end $$;
