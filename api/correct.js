// POST /api/correct (Vercel)
import { correctClassification } from "./_lib/db.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = req.body || {};
    const { entryId, originalText, aiChose, aiTags, userChose } = body;
    if (!entryId || !userChose) return res.status(400).json({ error: "entryId 和 userChose 必填" });
    const valid = ["task", "thought", "shopping", "idea", "link", "other"];
    if (!valid.includes(userChose)) return res.status(400).json({ error: "userChose 不合法" });
    await correctClassification({
      entryId, originalText: originalText || "", aiChose: aiChose || null,
      aiTags: Array.isArray(aiTags) ? aiTags : [], userChose,
    }, process.env);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("correct 出错:", err);
    return res.status(500).json({ error: err.message || "服务器内部错误" });
  }
}
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
