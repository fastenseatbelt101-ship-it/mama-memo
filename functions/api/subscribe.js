// POST /api/subscribe
// body: { endpoint, keys: { p256dh, auth } }（PushSubscription.toJSON()）
// 把订阅存到数据库，让后端可以以后给这个设备推送

import { upsertSubscription } from "../_lib/db.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return new Response(JSON.stringify({ error: "订阅格式不对" }), {
        status: 400, headers: corsJson()
      });
    }
    const ua = request.headers.get("User-Agent") || "";
    const saved = await upsertSubscription(body, ua, env);
    return new Response(JSON.stringify({ ok: true, id: saved?.id }), {
      status: 200, headers: corsJson()
    });
  } catch (err) {
    console.error("subscribe error:", err);
    return new Response(JSON.stringify({ error: err.message || "内部错误" }), {
      status: 500, headers: corsJson()
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
function corsJson() {
  return { "Content-Type": "application/json", ...corsHeaders() };
}
