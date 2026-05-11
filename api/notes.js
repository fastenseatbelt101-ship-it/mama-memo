// GET /api/notes (Vercel)
import { listNotes, listTagFrequencies } from "./_lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const offset = parseInt(req.query.offset || "0", 10);
    const typeParam = req.query.type;
    const tag = req.query.tag;
    let types = null;
    if (typeParam) types = typeParam.split(",").filter(Boolean);
    const [notesRes, tagFreq] = await Promise.all([
      listNotes({ limit, offset, types, tag }, process.env),
      offset === 0 ? listTagFrequencies(process.env) : Promise.resolve([]),
    ]);
    return res.status(200).json({
      rows: notesRes.rows.map(toClient),
      total: notesRes.total,
      tagFrequencies: tagFreq.slice(0, 20),
    });
  } catch (err) {
    console.error("notes 出错:", err);
    return res.status(500).json({ error: err.message || "服务器内部错误" });
  }
}
function toClient(r) {
  return { id: r.id, content: r.content, summary: r.ai_summary,
    type: r.type, tags: r.tags, topic: r.topic, created_at: r.created_at };
}
