// GET /api/vapid-key
// 返回 VAPID 公钥，前端订阅时要用

export async function onRequestGet(context) {
  const publicKey = context.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return new Response(JSON.stringify({ error: "VAPID_PUBLIC_KEY 未配置" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({ publicKey }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
