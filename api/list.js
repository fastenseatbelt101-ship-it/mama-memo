// GET /api/list (Vercel)
import { listTaskTodayAndTomorrow, listNotes } from "./_lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const beijing = new Date(Date.now() + 8 * 3600 * 1000);
    const todayStr = ymd(beijing);
    const tom = new Date(beijing);
    tom.setUTCDate(tom.getUTCDate() + 1);
    const tomorrowStr = ymd(tom);
    const [taskRes, noteRes] = await Promise.all([
      listTaskTodayAndTomorrow(todayStr, tomorrowStr, process.env),
      listNotes({ limit: 30, offset: 0 }, process.env),
    ]);
    return res.status(200).json({
      today: taskRes.today.map(toTask),
      tomorrow: taskRes.tomorrow.map(toTask),
      recentNotes: noteRes.rows.map(toNote),
      noteTotal: noteRes.total,
    });
  } catch (err) {
    console.error("list 出错:", err);
    return res.status(500).json({ error: err.message || "服务器内部错误" });
  }
}
function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function toTask(r) {
  return { id: r.id, title: r.ai_summary || r.content, content: r.content,
    date: r.task_date, time: r.task_time, tags: r.tags, topic: r.topic,
    done: r.done, notified: r.notified, created_at: r.created_at };
}
function toNote(r) {
  return { id: r.id, content: r.content, summary: r.ai_summary,
    type: r.type, tags: r.tags, topic: r.topic, created_at: r.created_at };
}
