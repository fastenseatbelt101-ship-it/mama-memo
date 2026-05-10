// Supabase 客户端封装（Cloudflare Workers 兼容）
import { createClient } from "@supabase/supabase-js";

export function getClient(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL 或 SUPABASE_SERVICE_KEY 未配置");
  }
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

// 插入多个任务
export async function insertTasks(tasks, originalText, env) {
  const sb = getClient(env);
  const rows = tasks.map(t => ({
    title: t.title,
    task_date: t.date,
    task_time: t.time,
    original_text: originalText,
    done: false,
    notified: false
  }));
  const { data, error } = await sb.from("tasks").insert(rows).select();
  if (error) throw error;
  return data;
}

// 查询今天 + 明天的任务
export async function listTodayAndTomorrow(todayStr, tomorrowStr, env) {
  const sb = getClient(env);
  const { data, error } = await sb
    .from("tasks")
    .select("*")
    .in("task_date", [todayStr, tomorrowStr])
    .order("task_date", { ascending: true })
    .order("task_time", { ascending: true, nullsFirst: false });
  if (error) throw error;
  const today = (data || []).filter(x => x.task_date === todayStr);
  const tomorrow = (data || []).filter(x => x.task_date === tomorrowStr);
  return { today, tomorrow };
}

// ============ Push 订阅 ============

export async function upsertSubscription(sub, userAgent, env) {
  const sb = getClient(env);
  const row = {
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent || null,
    last_seen: new Date().toISOString()
  };
  const { data, error } = await sb
    .from("push_subscriptions")
    .upsert(row, { onConflict: "endpoint" })
    .select();
  if (error) throw error;
  return data && data[0];
}

export async function getAllSubscriptions(env) {
  const sb = getClient(env);
  const { data, error } = await sb.from("push_subscriptions").select("*");
  if (error) throw error;
  return data || [];
}

export async function deleteSubscription(endpoint, env) {
  const sb = getClient(env);
  await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

// ============ 找到现在该推送的任务 ============
// 给定北京时间 now，找出 task_date == 今天 且 task_time 在 [now-5min, now+1min] 区间内
// 还没推送过（notified=false）
export async function findDueTasks(beijingNow, env) {
  const sb = getClient(env);
  const todayStr = ymd(beijingNow);

  // 时间窗口：往前 5 分钟（容错），往后 0 分钟
  const winStart = new Date(beijingNow.getTime() - 5 * 60 * 1000);
  const winEnd = new Date(beijingNow.getTime() + 60 * 1000); // 多 1 分钟兜底

  const startTime = hm(winStart);
  const endTime = hm(winEnd);

  // 简单方案：取今天所有还没推送过、有时间的任务，在代码里过滤
  const { data, error } = await sb
    .from("tasks")
    .select("*")
    .eq("task_date", todayStr)
    .eq("notified", false)
    .not("task_time", "is", null);
  if (error) throw error;

  return (data || []).filter(t => {
    if (!t.task_time) return false;
    const tt = t.task_time.slice(0, 5); // 'HH:MM:SS' → 'HH:MM'
    return tt >= startTime && tt <= endTime;
  });
}

export async function markTaskNotified(id, env) {
  const sb = getClient(env);
  await sb.from("tasks").update({ notified: true }).eq("id", id);
}

function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function hm(d) {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
