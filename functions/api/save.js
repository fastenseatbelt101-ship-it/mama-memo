// POST /api/save
// body: { text: "明天上午十点去医院" }
// 返回: { tasks: [{ id, title, date, time, ... }] }

import { parseWithAI } from "../_lib/parser.js";
import { insertTasks } from "../_lib/db.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const text = body?.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      return jsonResponse({ error: "text 不能为空" }, 400);
    }

    // 1. 调 Kimi 解析时间
    const { tasks: parsed } = await parseWithAI(text, env);

    // 如果 AI 没解析出任何任务，至少把原文作为一条无时间任务存下
    const tasksToSave = parsed.length > 0 ? parsed : [{
      title: text.trim().slice(0, 100),
      date: null,
      time: null
    }];

    // 2. 写 Supabase
    const saved = await insertTasks(tasksToSave, text, env);

    return jsonResponse({
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
    return jsonResponse({ error: err.message || "服务器内部错误" }, 500);
  }
}

// 处理预检
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}
