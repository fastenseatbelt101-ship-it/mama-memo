// POST /api/subscribe (Vercel)
import { upsertSubscription } from "./_lib/db.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = req.body || {};
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return res.status(400).json({ error: "订阅格式不对" });
    }
    const ua = req.headers["user-agent"] || "";
    const saved = await upsertSubscription(body, ua, process.env);
    return res.status(200).json({ ok: true, id: saved?.id });
  } catch (err) {
    console.error("subscribe error:", err);
    return res.status(500).json({ error: err.message || "内部错误" });
  }
}
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
