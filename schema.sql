-- 妈妈的备忘录：Supabase 建表 SQL
-- 用法：在 Supabase Dashboard → SQL Editor → 粘贴这段 → 点 Run

-- ============ 任务表 ============
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  task_date   date,
  task_time   time,
  original_text text,
  done        boolean not null default false,
  notified    boolean not null default false,    -- 是否已推送过提醒
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tasks_task_date on tasks (task_date);
create index if not exists idx_tasks_created_at on tasks (created_at desc);
create index if not exists idx_tasks_notified on tasks (notified) where notified = false;

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at
  before update on tasks
  for each row execute procedure set_updated_at();

-- ============ Web Push 订阅表 ============
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,             -- 浏览器返回的推送 endpoint URL
  p256dh      text not null,                    -- 用户公钥（用于加密 payload）
  auth        text not null,                    -- 用户认证密钥
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_endpoint on push_subscriptions (endpoint);

-- ============ 升级既有部署：补字段 ============
-- 如果你已经创建过 tasks 表（旧版），跑这段把 notified 字段补上
alter table tasks add column if not exists notified boolean not null default false;
