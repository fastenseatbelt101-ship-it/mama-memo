// POST /api/chat (Vercel)
import { parseQueryIntent, rerankAndAnswer } from "./_lib/parser.js";
import { searchByKeywords, searchByTags, searchByTopics, listRecent } from "./_lib/db.js";

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
    const fromDate = new Date(Date.now() - intent.fromDays * 24 * 3600 * 1000).toISOString();
    const [byKw, byTag, byTopic, recent] = await Promise.all([
      searchByKeywords(intent.keywords, { fromDate }, process.env),
      searchByTags(intent.tags, { fromDate }, process.env),
      searchByTopics(intent.topics, { fromDate }, process.env),
      listRecent(fromDate, 30, process.env),
    ]);
    const merged = new Map();
    function bump(row, source) {
      if (merged.has(row.id)) {
        merged.get(row.id).sources.add(source);
        merged.get(row.id).score += scoreFor(source);
      } else {
        merged.set(row.id, { row, sources: new Set([source]), score: scoreFor(source) });
      }
    }
    byKw.forEach(r => bump(r, "keyword"));
    byTag.forEach(r => bump(r, "tag"));
    byTopic.forEach(r => bump(r, "topic"));
    if (merged.size === 0) recent.forEach(r => bump(r, "recent"));
    const candidates = Array.from(merged.values())
      .sort((a, b) => b.score !== a.score ? b.score - a.score : new Date(b.row.created_at) - new Date(a.row.created_at))
      .map(x => x.row);
    const { answer, relevantIds } = await rerankAndAnswer(query, candidates, process.env);
    const entryMap = new Map(candidates.map(e => [e.id, e]));
    const relevantEntries = relevantIds.map(id => entryMap.get(id)).filter(Boolean);
    const fallback = relevantEntries.length === 0 ? candidates.slice(0, 5) : relevantEntries;
    return res.status(200).json({ answer, entries: fallback.map(toClient), intent });
  } catch (err) {
    console.error("chat 出错:", err);
    return res.status(500).json({ error: err.message || "服务器内部错误" });
  }
}
function scoreFor(s) { return s === "keyword" ? 3 : s === "tag" || s === "topic" ? 2 : 1; }
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function toClient(r) {
  return { id: r.id, content: r.content, summary: r.ai_summary,
    type: r.type, tags: r.tags, topic: r.topic, created_at: r.created_at };
}
