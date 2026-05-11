// POST /api/save (Vercel)
import { classifyAndExtract } from "./_lib/parser.js";
import { insertFromClassification } from "./_lib/db.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = req.body || {};
    const text = body.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text 不能为空" });
    }
    let classification;
    try { classification = await classifyAndExtract(text, process.env); }
    catch (err) {
      console.error("classify failed:", err);
      classification = { type: "other", tags: [], topic: null, summary: text.trim().slice(0,60), tasks: [] };
    }
    let saved;
    try { saved = await insertFromClassification(text, classification, process.env); }
    catch (err) {
      console.error("db insert failed:", err);
      return res.status(500).json({ error: "数据库写入失败：" + err.message });
    }
    return res.status(200).json({
      type: classification.type,
      tags: classification.tags,
      topic: classification.topic,
      summary: classification.summary,
      entries: saved.map(toClient),
    });
  } catch (err) {
    console.error("save 出错:", err);
    return res.status(500).json({ error: err.message || "服务器内部错误" });
  }
}
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function toClient(row) {
  return {
    id: row.id, content: row.content, summary: row.ai_summary,
    type: row.type, tags: row.tags, topic: row.topic,
    date: row.task_date, time: row.task_time,
    done: row.done, created_at: row.created_at,
  };
}
