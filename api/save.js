// POST /api/save
// body: { text: "明天上午十点去医院" }
// 返回: { tasks: [{ id, title, date, time, ... }] }

import { parseWithAI } from "./_lib/parser.js";
import { insertTasks } from "./_lib/db.js";

export default async function handler(req, res) {
  // CORS（如果以后前端独立部署的话；同源时不影响）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "只支持 POST" });
  }

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text 不能为空" });
    }

    // 1. 调 DeepSeek 解析时间
    const { tasks: parsed } = await parseWithAI(text);

    // 如果 AI 没解析出任何任务，至少把原文作为一条无时间任务存下
    const tasksToSave = parsed.length > 0 ? parsed : [{
      title: text.trim().slice(0, 100),
      date: null,
      time: null
    }];

    // 2. 写 Supabase
    const saved = await insertTasks(tasksToSave, text);

    // 返回前端要的格式（字段名对齐前端）
    return res.status(200).json({
      tasks: saved.map(r => ({
        id: r.id,
        title: r.title,
        date: r.task_date,
        time: r.task_time,
        original: r.original_text,
        created_at: r.created_at,
        done: r.done
      }))
    });
  } catch (err) {
    console.error("save 出错:", err);
    return res.status(500).json({ error: err.message || "服务器内部错误" });
  }
}
