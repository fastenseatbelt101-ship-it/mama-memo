// POST /api/search (Vercel)
import { parseQueryIntent } from "./_lib/parser.js";
import { searchByKeywords, searchByTags, searchByTopics } from "./_lib/db.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = req.body || {};
    const query = body.query;
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "query 不能为空" });
    }
    const intent = await parseQueryIntent(query, process.env);
    const fromDays = body.fromDays || intent.fromDays;
    const fromDate = new Date(Date.now() - fromDays * 24 * 3600 * 1000).toISOString();
    const types = body.types || null;
    const [byKw, byTag, byTopic] = await Promise.all([
      searchByKeywords(intent.keywords, { fromDate, types }, process.env),
      searchByTags(intent.tags, { fromDate, types }, process.env),
      searchByTopics(intent.topics, { fromDate, types }, process.env),
    ]);
    const merged = new Map();
    function bump(row, source) {
      const cur = merged.get(row.id);
      if (cur) { cur.sources.add(source); cur.score += sourceScore(source); }
      else merged.set(row.id, { row, sources: new Set([source]), score: sourceScore(source) });
    }
    for (const r of byKw) bump(r, "keyword");
    for (const r of byTag) bump(r, "tag");
    for (const r of byTopic) bump(r, "topic");
    const ranked = Array.from(merged.values())
      .sort((a, b) => b.score !== a.score ? b.score - a.score : new Date(b.row.created_at) - new Date(a.row.created_at))
      .map(x => x.row);
    return res.status(200).json({ intent, results: ranked.map(toClient), total: ranked.length });
  } catch (err) {
    console.error("search 出错:", err);
    return res.status(500).json({ error: err.message || "服务器内部错误" });
  }
}
function sourceScore(s) { return s === "keyword" ? 3 : s === "tag" || s === "topic" ? 2 : 1; }
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function toClient(r) {
  return { id: r.id, content: r.content, summary: r.ai_summary,
    type: r.type, tags: r.tags, topic: r.topic, created_at: r.created_at };
}
