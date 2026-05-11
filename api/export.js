// GET /api/export (Vercel)
import { listAllByTypes } from "./_lib/db.js";

const TYPE_LABEL = { task:"待办", thought:"心事", shopping:"购物", idea:"灵感", link:"网址", other:"其它" };

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const format = req.query.format || "md";
    const typesParam = req.query.types;
    const types = typesParam ? typesParam.split(",").filter(Boolean)
      : ["thought","shopping","idea","link","other"];
    const rows = await listAllByTypes(types, process.env);

    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename("json")}"`);
      return res.status(200).send(JSON.stringify(rows, null, 2));
    }
    if (format === "html") {
      res.setHeader("Content-Type", "application/vnd.ms-word; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename("doc")}"`);
      return res.status(200).send(buildHTML(rows, types));
    }
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename("md")}"`);
    return res.status(200).send(buildMarkdown(rows, types));
  } catch (err) {
    console.error("export 出错:", err);
    return res.status(500).json({ error: err.message || "服务器内部错误" });
  }
}

function filename(ext) {
  const d = new Date();
  const b = new Date(d.getTime() + 8 * 3600 * 1000);
  const y = b.getUTCFullYear();
  const m = String(b.getUTCMonth() + 1).padStart(2, "0");
  const day = String(b.getUTCDate()).padStart(2, "0");
  return `mama-memo-${y}${m}${day}.${ext}`;
}

function buildMarkdown(rows, types) {
  const head = [
    `# 妈妈的备忘录导出`, "",
    `> 导出时间：${formatNow()}`,
    `> 类型：${types.map(t => TYPE_LABEL[t] || t).join("、")}`,
    `> 总数：${rows.length}`,
    "", `---`, "",
  ];
  const byDate = new Map();
  for (const r of rows) {
    const d = (r.created_at || "").slice(0, 10) || "未知日期";
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(r);
  }
  const lines = [];
  for (const [date, items] of byDate.entries()) {
    lines.push(`## ${date}`, "");
    for (const r of items) {
      const time = (r.created_at || "").slice(11, 16);
      const tags = (r.tags || []).map(t => `\`#${t}\``).join(" ");
      const tl = TYPE_LABEL[r.type] || r.type;
      lines.push(`### ${time}　[${tl}]　${r.ai_summary || ""}`, "");
      if (tags) lines.push(tags, "");
      lines.push(r.content, "", "---", "");
    }
  }
  return head.concat(lines).join("\n");
}

function buildHTML(rows, types) {
  const esc = s => String(s || "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
  let html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>妈妈的备忘录导出</title>
<style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-width:800px;margin:30px auto;line-height:1.6}
h1{color:#5C4733}h2{color:#5C4733;margin-top:30px;border-bottom:1px solid #ccc;padding-bottom:5px}
h3{color:#D97757;margin-top:18px;font-size:16px}.meta{color:#888;font-size:13px}
.content{white-space:pre-wrap;margin:8px 0 16px}
.tag{display:inline-block;background:#FFF1E6;color:#6B4F33;padding:2px 8px;border-radius:12px;margin-right:4px;font-size:12px}
hr{border:0;border-top:1px dashed #ddd;margin:24px 0}</style></head><body>
<h1>妈妈的备忘录导出</h1>
<p class="meta">导出时间：${esc(formatNow())}<br>类型：${types.map(t => esc(TYPE_LABEL[t]||t)).join("、")}<br>总数：${rows.length}</p><hr>`;
  const byDate = new Map();
  for (const r of rows) {
    const d = (r.created_at || "").slice(0, 10) || "未知日期";
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(r);
  }
  for (const [date, items] of byDate.entries()) {
    html += `<h2>${esc(date)}</h2>`;
    for (const r of items) {
      const time = (r.created_at || "").slice(11, 16);
      const tl = TYPE_LABEL[r.type] || r.type;
      html += `<h3>${esc(time)}　[${esc(tl)}]　${esc(r.ai_summary || "")}</h3>`;
      const tagsHtml = (r.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join("");
      if (tagsHtml) html += `<p>${tagsHtml}</p>`;
      html += `<div class="content">${esc(r.content)}</div>`;
    }
  }
  return html + "</body></html>";
}

function formatNow() {
  const d = new Date();
  const b = new Date(d.getTime() + 8 * 3600 * 1000);
  const y = b.getUTCFullYear();
  const m = String(b.getUTCMonth() + 1).padStart(2, "0");
  const day = String(b.getUTCDate()).padStart(2, "0");
  const hh = String(b.getUTCHours()).padStart(2, "0");
  const mm = String(b.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm} (北京时间)`;
}
