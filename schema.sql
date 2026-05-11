-- mama-memo schema v2.2 (ASCII-only comments to avoid Windows clip encoding issues)

-- Step 1: enable trigram extension (must be FIRST, indexes below need it)
create extension if not exists pg_trgm;

-- Step 2: main entries table
create table if not exists entries (
  id            uuid primary key default gen_random_uuid(),
  content       text not null,
  ai_summary    text,
  type          text not null default 'other',
  tags          text[] not null default '{}',
  topic         text,
  task_date     date,
  task_time     time,
  done          boolean not null default false,
  notified      boolean not null default false,
  user_corrected_type text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_entries_type_created on entries (type, created_at desc);
create index if not exists idx_entries_task_date    on entries (task_date)        where type = 'task';
create index if not exists idx_entries_tags         on entries using gin (tags);
create index if not exists idx_entries_notified     on entries (notified)         where type = 'task' and notified = false;
create index if not exists idx_entries_content_trgm on entries using gin (content gin_trgm_ops);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_entries_updated_at on entries;
create trigger trg_entries_updated_at
  before update on entries
  for each row execute procedure set_updated_at();

-- Step 3: web push subscriptions
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_endpoint on push_subscriptions (endpoint);

-- Step 4: classification corrections (for prompt iteration)
create table if not exists classification_corrections (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid references entries(id) on delete cascade,
  original_text text not null,
  ai_chose      text,
  ai_tags       text[],
  user_chose    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_corrections_created on classification_corrections (created_at desc);

-- Step 5: drop old tasks table (testing data only)
drop table if exists tasks;
