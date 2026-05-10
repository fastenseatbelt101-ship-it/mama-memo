// 妈妈的备忘录 Service Worker
// 作用：
// 1. 接收页面调度的本地通知（即使 App 在后台也能弹出）
// 2. 处理通知点击（聚焦/打开 App）
// 3. 后续会扩展为：接收服务端 Web Push 推送

const SW_VERSION = "v1";

self.addEventListener("install", (event) => {
  // 立即接管，不等老 SW 退出
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 后续接服务端推送时启用：
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); }
  catch { payload = { title: "提醒", body: event.data.text() }; }

  const title = payload.title || "该提醒了";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "mama-memo",
    requireInteraction: true,
    data: payload.data || {}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 点击通知 → 打开/聚焦 App
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
