-- Run once in Supabase > SQL editor.

create extension if not exists pgcrypto;

create table if not exists items (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'task' check (kind in ('task', 'idea', 'reminder')),
  text        text not null,
  priority    smallint not null default 2 check (priority between 1 and 3), -- 1 high, 2 normal, 3 low
  due_date    date,
  due_time    time,
  remind_at   timestamptz,
  category    text,
  done        boolean not null default false,
  done_at     timestamptz,
  source      text,               -- tv, phone, text
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists items_open_idx on items (done, due_date);

create table if not exists meta (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Nothing is readable with the public anon key.
-- Only the server (service role key) reads and writes.
-- The screens get a "something changed" ping over Realtime Broadcast, then ask the server.
alter table items enable row level security;
alter table meta  enable row level security;
