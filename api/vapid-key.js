// GET /api/vapid-key (Vercel)
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return res.status(500).json({ error: "VAPID_PUBLIC_KEY 未配置" });
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({ publicKey });
}
