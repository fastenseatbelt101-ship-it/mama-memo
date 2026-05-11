// Supabase 客户端封装（Cloudflare Workers / Vercel 兼容）
import { createClient } from "@supabase/supabase-js";

export function getClient(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL 或 SUPABASE_SERVICE_KEY 未配置");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function insertFromClassification(content, classification, env) {
  const sb = getClient(env);
  const { type, tags, topic, summary, tasks } = classification;

  if (type === "task" && tasks.length > 0) {
    const rows = tasks.map(t => ({
      content,
      ai_summary: summary || t.title,
      type: "task",
      tags,
      topic,
      task_date: t.date,
      task_time: t.time,
    }));
    const { data, error } = await sb.from("entries").insert(rows).select();
    if (error) throw error;
    return data;
  }

  const row = { content, ai_summary: summary, type, tags, topic };
  const { data, error } = await sb.from("entries").insert([row]).select();
  if (error) throw error;
  return data;
}

export async function listTaskTodayAndTomorrow(todayStr, tomorrowStr, env) {
  const sb = getClient(env);
  const { data, error } = await sb
    .from("entries")
    .select("*")
    .eq("type", "task")
    .in("task_date", [todayStr, tomorrowStr])
    .order("task_date", { ascending: true })
    .order("task_time", { ascending: true, nullsFirst: false });
  if (error) throw error;
  const today = (data || []).filter(x => x.task_date === todayStr);
  const tomorrow = (data || []).filter(x => x.task_date === tomorrowStr);
  return { today, tomorrow };
}

export async function listNotes(opts, env) {
  const { limit = 50, offset = 0, types, tag } = opts || {};
  const sb = getClient(env);
  let q = sb.from("entries").select("*", { count: "exact" });
  if (types && types.length > 0) {
    q = q.in("type", types);
  } else {
    q = q.neq("type", "task");
  }
  if (tag) q = q.contains("tags", [tag]);
  q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data || [], total: count || 0 };
}

export async function searchByKeywords(keywords, opts, env) {
  const { fromDate, types } = opts || {};
  const sb = getClient(env);
  if (!keywords || keywords.length === 0) return [];
  const orParts = [];
  for (const kw of keywords) {
    const safe = kw.replace(/[%_,()]/g, "");
    if (!safe) continue;
    orParts.push(`content.ilike.%${safe}%`);
    orParts.push(`ai_summary.ilike.%${safe}%`);
    orParts.push(`topic.ilike.%${safe}%`);
  }
  if (orParts.length === 0) return [];
  let q = sb.from("entries").select("*").or(orParts.join(","));
  if (types && types.length > 0) q = q.in("type", types);
  if (fromDate) q = q.gte("created_at", fromDate);
  q = q.order("created_at", { ascending: false }).limit(50);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function searchByTags(tags, opts, env) {
  const { fromDate, types } = opts || {};
  const sb = getClient(env);
  if (!tags || tags.length === 0) return [];
  let q = sb.from("entries").select("*").overlaps("tags", tags);
  if (types && types.length > 0) q = q.in("type", types);
  if (fromDate) q = q.gte("created_at", fromDate);
  q = q.order("created_at", { ascending: false }).limit(50);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listRecent(fromDate, limit, env) {
  const sb = getClient(env);
  const { data, error } = await sb.from("entries").select("*")
    .gte("created_at", fromDate)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function listAllByTypes(types, env) {
  const sb = getClient(env);
  const { data, error } = await sb.from("entries").select("*").in("type", types)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listTagFrequencies(env) {
  const sb = getClient(env);
  const { data, error } = await sb.from("entries").select("tags").neq("type", "task");
  if (error) throw error;
  const counts = new Map();
  for (const row of data || []) {
    for (const t of row.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export async function correctClassification({ entryId, originalText, aiChose, aiTags, userChose }, env) {
  const sb = getClient(env);
  await sb.from("classification_corrections").insert([{
    entry_id: entryId, original_text: originalText,
    ai_chose: aiChose, ai_tags: aiTags, user_chose: userChose,
  }]);
  await sb.from("entries").update({
    type: userChose, user_corrected_type: aiChose,
  }).eq("id", entryId);
}

export async function upsertSubscription(sub, userAgent, env) {
  const sb = getClient(env);
  const row = {
    endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
    user_agent: userAgent || null, last_seen: new Date().toISOString(),
  };
  const { data, error } = await sb.from("push_subscriptions")
    .upsert(row, { onConflict: "endpoint" }).select();
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

export async function findDueTasks(beijingNow, env) {
  const sb = getClient(env);
  const todayStr = ymd(beijingNow);
  const winStart = new Date(beijingNow.getTime() - 5 * 60 * 1000);
  const winEnd = new Date(beijingNow.getTime() + 60 * 1000);
  const startTime = hm(winStart);
  const endTime = hm(winEnd);
  const { data, error } = await sb.from("entries").select("*")
    .eq("type", "task").eq("task_date", todayStr).eq("notified", false)
    .not("task_time", "is", null);
  if (error) throw error;
  return (data || []).filter(t => {
    if (!t.task_time) return false;
    const tt = t.task_time.slice(0, 5);
    return tt >= startTime && tt <= endTime;
  });
}

export async function markEntryNotified(id, env) {
  const sb = getClient(env);
  await sb.from("entries").update({ notified: true }).eq("id", id);
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

// ================================
// 按 topic 检索（v2.1 加入：6 类 topic 中匹配）
// ================================
export async function searchByTopics(topics, opts, env) {
  const { fromDate, types } = opts || {};
  const sb = getClient(env);
  if (!topics || topics.length === 0) return [];
  let q = sb.from("entries").select("*").in("topic", topics);
  if (types && types.length > 0) q = q.in("type", types);
  if (fromDate) q = q.gte("created_at", fromDate);
  q = q.order("created_at", { ascending: false }).limit(50);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
