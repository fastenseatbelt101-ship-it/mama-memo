// GET /api/cron-check?secret=... (Vercel)
import { findDueTasks, getAllSubscriptions, markEntryNotified, deleteSubscription } from "./_lib/db.js";
import { sendPush } from "./_lib/webpush.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  try {
    const secret = req.query.secret;
    if (!process.env.CRON_SECRET) return res.status(500).send("CRON_SECRET 未配置");
    if (secret !== process.env.CRON_SECRET) return res.status(401).send("Unauthorized");

    const utcNow = new Date();
    const beijingNow = new Date(utcNow.getTime() + 8 * 3600 * 1000);
    const due = await findDueTasks(beijingNow, process.env);
    if (!due.length) return res.status(200).send(`OK (no due tasks at ${formatBJ(beijingNow)})`);

    const subs = await getAllSubscriptions(process.env);
    if (!subs.length) {
      for (const t of due) await markEntryNotified(t.id, process.env);
      return res.status(200).send(`No subscribers. Marked ${due.length} tasks as notified.`);
    }

    const vapid = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      subject: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    };

    const results = [];
    for (const task of due) {
      const payload = {
        title: "该提醒了",
        body: `${task.task_time?.slice(0,5) || ""}　${task.ai_summary || task.content}`,
        tag: `task-${task.id}`,
        data: { taskId: task.id },
      };
      let sent = 0, failed = 0;
      for (const sub of subs) {
        try {
          const r = await sendPush({
            endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth }
          }, payload, vapid);
          if (r.ok) sent++;
          else if (r.status === 404 || r.status === 410) await deleteSubscription(sub.endpoint, process.env);
          else failed++;
        } catch (e) {
          console.error("push send error:", e);
          failed++;
        }
      }
      await markEntryNotified(task.id, process.env);
      results.push({ id: task.id, title: task.ai_summary || task.content, sent, failed });
    }
    return res.status(200).send(`OK\n${JSON.stringify(results, null, 2)}`);
  } catch (err) {
    console.error("cron-check error:", err);
    return res.status(500).send(`ERROR: ${err.message || err}`);
  }
}
function formatBJ(d) {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `北京时间 ${h}:${m}`;
}
