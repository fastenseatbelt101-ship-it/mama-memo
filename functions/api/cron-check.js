// GET /api/cron-check
// 每分钟被 cron-job.org 调用一次，扫描该提醒的任务并推送
// 必须带 ?secret=XXX，否则任何人都能触发

import { findDueTasks, getAllSubscriptions, markTaskNotified, deleteSubscription } from "../_lib/db.js";
import { sendPush } from "../_lib/webpush.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    // 鉴权
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    if (!env.CRON_SECRET) {
      return text("CRON_SECRET 未配置", 500);
    }
    if (secret !== env.CRON_SECRET) {
      return text("Unauthorized", 401);
    }

    // 用北京时间
    const utcNow = new Date();
    const beijingNow = new Date(utcNow.getTime() + 8 * 3600 * 1000);

    const due = await findDueTasks(beijingNow, env);
    if (!due.length) return text(`OK (no due tasks at ${formatBJ(beijingNow)})`);

    const subs = await getAllSubscriptions(env);
    if (!subs.length) {
      // 没有订阅设备，把任务标记掉以免重复检查
      for (const t of due) await markTaskNotified(t.id, env);
      return text(`No subscribers. Marked ${due.length} tasks as notified.`);
    }

    const vapid = {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT || "mailto:admin@example.com"
    };

    const results = [];
    for (const task of due) {
      const payload = {
        title: "该提醒了",
        body: `${task.task_time?.slice(0,5) || ""}　${task.title}`,
        tag: `task-${task.id}`,
        data: { taskId: task.id }
      };
      let sent = 0, failed = 0;
      for (const sub of subs) {
        try {
          const r = await sendPush({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          }, payload, vapid);
          if (r.ok) {
            sent++;
          } else if (r.status === 404 || r.status === 410) {
            // 订阅已失效，清掉
            await deleteSubscription(sub.endpoint, env);
          } else {
            failed++;
          }
        } catch (e) {
          console.error("push send error:", e, "endpoint:", sub.endpoint);
          failed++;
        }
      }
      // 哪怕全失败也标记，避免下一分钟重推（防止刷屏）
      await markTaskNotified(task.id, env);
      results.push({ id: task.id, title: task.title, sent, failed });
    }

    return text(`OK\n${JSON.stringify(results, null, 2)}`);
  } catch (err) {
    console.error("cron-check error:", err);
    return text(`ERROR: ${err.message || err}`, 500);
  }
}

function text(s, status = 200) {
  return new Response(String(s), { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
function formatBJ(d) {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `北京时间 ${h}:${m}`;
}
