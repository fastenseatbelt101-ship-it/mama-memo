// GET /api/list
// 返回今天和明天的任务清单
// { today: [...], tomorrow: [...] }

import { listTodayAndTomorrow } from "./_lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "只支持 GET" });

  try {
    // 用北京时间计算今日/明日
    const now = new Date();
    const beijing = new Date(now.getTime() + 8 * 3600 * 1000);
    const todayStr = ymd(beijing);
    const tom = new Date(beijing);
    tom.setUTCDate(tom.getUTCDate() + 1);
    const tomorrowStr = ymd(tom);

    const { today, tomorrow } = await listTodayAndTomorrow(todayStr, tomorrowStr);

    return res.status(200).json({
      today: today.map(toClient),
      tomorrow: tomorrow.map(toClient)
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

function toClient(r) {
  return {
    id: r.id,
    title: r.title,
    date: r.task_date,
    time: r.task_time,
    original: r.original_text,
    created_at: r.created_at,
    done: r.done
  };
}
