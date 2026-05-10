// Supabase 客户端封装
import { createClient } from "@supabase/supabase-js";

let _client = null;
export function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY; // 服务端用 service key（绕过 RLS）
  if (!url || !key) {
    throw new Error("SUPABASE_URL 或 SUPABASE_SERVICE_KEY 未配置");
  }
  _client = createClient(url, key, {
    auth: { persistSession: false }
  });
  return _client;
}

// 插入多个任务
export async function insertTasks(tasks, originalText) {
  const sb = getClient();
  const rows = tasks.map(t => ({
    title: t.title,
    task_date: t.date,   // 可以是 null
    task_time: t.time,   // 可以是 null
    original_text: originalText,
    done: false
  }));
  const { data, error } = await sb.from("tasks").insert(rows).select();
  if (error) throw error;
  return data;
}

// 查询某天的任务
export async function listTasksByDate(dateStr) {
  const sb = getClient();
  const { data, error } = await sb
    .from("tasks")
    .select("*")
    .eq("task_date", dateStr)
    .order("task_time", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

// 查询今天 + 明天的任务（一次返回）
export async function listTodayAndTomorrow(todayStr, tomorrowStr) {
  const sb = getClient();
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
