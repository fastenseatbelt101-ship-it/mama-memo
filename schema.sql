-- 妈妈的备忘录：Supabase 建表 SQL
-- 用法：在 Supabase Dashboard → SQL Editor → 粘贴这段 → 点 Run
-- 全程 30 秒搞定

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  task_date   date,                                  -- 任务发生的日期，可空
  task_time   time,                                  -- 任务发生的时间，可空
  original_text text,                                -- 妈妈说的原话，便于追溯
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 按日期查的索引（让 /api/list 快）
create index if not exists idx_tasks_task_date on tasks (task_date);
create index if not exists idx_tasks_created_at on tasks (created_at desc);

-- 简单触发器：updated_at 自动跟着变
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
