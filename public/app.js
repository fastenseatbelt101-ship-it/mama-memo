// ==============================================
// 妈妈的备忘录 · 前端逻辑（v2 · 3 tab 架构）
// ==============================================

// ============ 状态 ============
const STATE = {
  tab: "chat",                    // chat | tasks | notes
  inputMode: "record",            // record | ask
  today: [],                      // 今日 task
  tomorrow: [],                   // 明日 task
  notes: [],                      // 心事 list
  noteTotal: 0,
  noteOffset: 0,
  notesTagFilter: "",
  tagFrequencies: [],
  chat: [],                       // [{ role:'me'|'ai', content, meta?, refs? }]
  scheduledTimers: [],
};
const STORAGE = {
  CHAT: "mama_memo_chat_v2",
  NOTIF_DECISION: "mama_memo_notif_decided",
  TOMORROW_OPEN: "mama_memo_tomorrow_open",
  INPUT_MODE: "mama_memo_input_mode",
};

// ============ 工具 ============
function $(id) { return document.getElementById(id); }
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() { return ymd(new Date()); }
function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d);
}
function formatDateLabel(d = new Date()) {
  const wd = ["日","一","二","三","四","五","六"][d.getDay()];
  return `${d.getMonth()+1}月${d.getDate()}日 周${wd}`;
}
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function formatRelativeDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const days = Math.floor((today - d) / (24 * 3600 * 1000));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return ymd(d);
}
const TYPE_LABEL = { task:"待办", thought:"心事", shopping:"购物", idea:"灵感", link:"网址", other:"其它" };

// ============ Toast ============
const toastEl = $("toast");
function showToast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.classList.toggle("error", !!isError);
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

// ============ 后端调用 ============
async function api(path, opts = {}) {
  const resp = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    try { const j = await resp.json(); if (j.error) errMsg = j.error; } catch {}
    throw new Error(errMsg);
  }
  return await resp.json();
}

async function loadInitial() {
  try {
    const data = await api("/api/list");
    STATE.today = data.today || [];
    STATE.tomorrow = data.tomorrow || [];
    STATE.notes = data.recentNotes || [];
    STATE.noteTotal = data.noteTotal || 0;
    STATE.noteOffset = STATE.notes.length;
    renderTasks();
    renderNotes();
    renderTabBadges();
    scheduleLocalNotifications();
  } catch (e) {
    console.warn("loadInitial failed", e);
  }
}

async function loadMoreNotes() {
  try {
    const url = STATE.notesTagFilter
      ? `/api/notes?limit=30&offset=${STATE.noteOffset}&tag=${encodeURIComponent(STATE.notesTagFilter)}`
      : `/api/notes?limit=30&offset=${STATE.noteOffset}`;
    const data = await api(url);
    STATE.notes = STATE.notes.concat(data.rows || []);
    STATE.noteTotal = data.total || 0;
    STATE.noteOffset = STATE.notes.length;
    if (data.tagFrequencies && data.tagFrequencies.length > 0) {
      STATE.tagFrequencies = data.tagFrequencies;
    }
    renderNotes();
  } catch (e) {
    showToast("加载更多失败", true);
  }
}

async function refreshNotes() {
  STATE.notes = []; STATE.noteOffset = 0;
  try {
    const url = STATE.notesTagFilter
      ? `/api/notes?limit=30&offset=0&tag=${encodeURIComponent(STATE.notesTagFilter)}`
      : `/api/notes?limit=30&offset=0`;
    const data = await api(url);
    STATE.notes = data.rows || [];
    STATE.noteTotal = data.total || 0;
    STATE.noteOffset = STATE.notes.length;
    if (data.tagFrequencies) STATE.tagFrequencies = data.tagFrequencies;
    renderNotes();
  } catch (e) {
    showToast("刷新失败", true);
  }
}

// ============ Tab 切换 ============
function switchTab(tab) {
  STATE.tab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.toggle("active", p.id === `pane-${tab}`));
  if (tab === "notes" && STATE.notes.length === 0) refreshNotes();
}

// ============ 渲染 ============
function renderTasks() {
  const todayList = $("todayList");
  const tomorrowList = $("tomorrowList");
  $("todayCount").textContent = STATE.today.length ? `${STATE.today.length}件` : "";
  $("tomorrowCount").textContent = STATE.tomorrow.length ? `${STATE.tomorrow.length}件` : "";

  todayList.innerHTML = renderTaskList(STATE.today, "今天还没有记什么 ✿");
  tomorrowList.innerHTML = renderTaskList(STATE.tomorrow, "明天暂无安排");
}
function renderTaskList(list, emptyText) {
  if (!list.length) return `<div class="empty">${emptyText}</div>`;
  const sorted = [...list].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
  return sorted.map(t => `
    <div class="task-item" data-id="${escapeHtml(t.id)}">
      <div class="task-time ${t.time ? "" : "no-time"}">${escapeHtml((t.time || "随时").slice(0, 5))}</div>
      <div class="task-content">${escapeHtml(t.title || t.content)}</div>
    </div>
  `).join("");
}

function renderNotes() {
  // 渲染标签过滤栏
  const filterBar = $("filterBar");
  // 保留固定的"全部"按钮和"导出"按钮，重建中间的标签按钮
  const fixedBtns = `
    <button class="filter-tag ${STATE.notesTagFilter === "" ? "active" : ""}" data-tag="">全部</button>
  `;
  const tagBtns = STATE.tagFrequencies.slice(0, 12).map(({ tag, count }) =>
    `<button class="filter-tag ${STATE.notesTagFilter === tag ? "active" : ""}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} ${count}</button>`
  ).join("");
  filterBar.innerHTML = fixedBtns + tagBtns + `<button class="export-btn" id="exportBtn">导出</button>`;

  const list = $("notesList");
  if (!STATE.notes.length) {
    list.innerHTML = `<div class="empty">还没有心事记录 ✿<br><span style="font-size:13px">在交互页随便说一句话开始</span></div>`;
    $("loadMoreBtn").style.display = "none";
    return;
  }
  list.innerHTML = STATE.notes.map(n => {
    const tagsHtml = (n.tags || []).map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join("");
    const summary = n.summary || (n.content || "").slice(0, 50);
    const isShort = (n.content || "").length <= 80;
    return `
    <div class="note-item" data-id="${escapeHtml(n.id)}">
      <div class="note-meta">
        <span class="type-badge">${escapeHtml(TYPE_LABEL[n.type] || n.type)}</span>
        ${n.topic ? `<span>· ${escapeHtml(n.topic)}</span>` : ""}
        <span class="date">${escapeHtml(formatRelativeDate(n.created_at))} ${escapeHtml(formatTime(n.created_at))}</span>
      </div>
      ${summary ? `<div class="note-summary">${escapeHtml(summary)}</div>` : ""}
      <div class="note-content ${isShort ? "short" : ""}">${escapeHtml(n.content)}</div>
      ${tagsHtml ? `<div class="note-tags">${tagsHtml}</div>` : ""}
    </div>`;
  }).join("");
  $("loadMoreBtn").style.display = STATE.noteOffset < STATE.noteTotal ? "block" : "none";
}

function renderTabBadges() {
  const todayBadge = $("badgeTasks");
  const total = STATE.today.length + STATE.tomorrow.length;
  todayBadge.textContent = total > 0 ? String(total) : "";
  todayBadge.classList.toggle("zero", total === 0);
  $("badgeNotes").textContent = "";
}

// ============ 聊天 ============
function loadChat() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORAGE.CHAT) || "[]");
    if (Array.isArray(arr)) STATE.chat = arr.slice(-40);  // 最多保留 40 条
  } catch { STATE.chat = []; }
}
function saveChat() {
  localStorage.setItem(STORAGE.CHAT, JSON.stringify(STATE.chat.slice(-40)));
}
function appendChat(msg) {
  STATE.chat.push(msg);
  saveChat();
  renderChat();
}
function renderChat() {
  const el = $("chatList");
  if (!STATE.chat.length) {
    el.innerHTML = `<div class="chat-empty">在下面说点什么试试 ✿<br>"今天感觉腰有点疼" / "明天三点开会" / "记得买洗发水" 都行<br><br>想找以前说过什么？切到 🔍 问 AI 模式</div>`;
    return;
  }
  el.innerHTML = STATE.chat.map(m => {
    if (m.role === "me") {
      return `<div class="chat-bubble me selectable">${escapeHtml(m.content)}</div>`;
    }
    let metaHtml = "";
    if (m.meta) {
      metaHtml = `<div class="meta">${escapeHtml(m.meta)}</div>`;
    }
    let refsHtml = "";
    if (m.refs && m.refs.length) {
      refsHtml = `<div class="ref-list">` + m.refs.map(r =>
        `<div class="ref-item" data-id="${escapeHtml(r.id)}">${escapeHtml((r.summary || r.content).slice(0, 50))}<br><span style="opacity:0.6;font-size:12px">${escapeHtml(formatRelativeDate(r.created_at))}</span></div>`
      ).join("") + `</div>`;
    }
    const cls = m.thinking ? "ai thinking" : "ai";
    return `<div class="chat-bubble ${cls} selectable">${escapeHtml(m.content)}${metaHtml}${refsHtml}</div>`;
  }).join("");
  // 自动滚到底
  setTimeout(() => {
    el.scrollIntoView({ block: "end", behavior: "smooth" });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, 50);
}

// ============ 提交：根据 inputMode 走不同流程 ============
const memoEl = $("memo");
const submitBtn = $("submit");

async function submitInput() {
  const text = memoEl.value.trim();
  if (!text) { memoEl.focus(); return; }

  // 自动切到交互 tab，让用户看到反馈
  if (STATE.tab !== "chat") switchTab("chat");

  if (STATE.inputMode === "record") {
    await doRecord(text);
  } else {
    await doAsk(text);
  }
  memoEl.value = "";
}

async function doRecord(text) {
  appendChat({ role: "me", content: text });
  appendChat({ role: "ai", thinking: true, content: "正在整理..." });
  submitBtn.disabled = true;
  try {
    const data = await api("/api/save", { method: "POST", body: JSON.stringify({ text }) });
    // 替换最后那条 thinking
    STATE.chat.pop();
    const tags = (data.tags || []).join("、");
    const meta = `${TYPE_LABEL[data.type] || data.type}${data.topic ? "·" + data.topic : ""}${tags ? "  标签：" + tags : ""}`;
    appendChat({
      role: "ai",
      content: `好的，记下了 ✓`,
      meta,
    });
    // 更新本地数据
    if (data.entries) {
      for (const e of data.entries) {
        if (e.type === "task") {
          if (e.date === todayStr()) STATE.today.push(toClientTask(e));
          else if (e.date === tomorrowStr()) STATE.tomorrow.push(toClientTask(e));
        } else {
          STATE.notes.unshift(toClientNote(e));
        }
      }
      renderTasks();
      renderTabBadges();
      scheduleLocalNotifications();
    }
  } catch (e) {
    STATE.chat.pop();
    appendChat({ role: "ai", content: "出问题了：" + e.message });
  } finally {
    submitBtn.disabled = false;
  }
}

async function doAsk(query) {
  appendChat({ role: "me", content: query });
  appendChat({ role: "ai", thinking: true, content: "翻一翻..." });
  submitBtn.disabled = true;
  try {
    const data = await api("/api/chat", { method: "POST", body: JSON.stringify({ query }) });
    STATE.chat.pop();
    appendChat({
      role: "ai",
      content: data.answer || "下面是相关的记录：",
      refs: data.entries || [],
    });
  } catch (e) {
    STATE.chat.pop();
    appendChat({ role: "ai", content: "AI 回答失败：" + e.message });
  } finally {
    submitBtn.disabled = false;
  }
}

function toClientTask(e) {
  return {
    id: e.id, title: e.summary || e.content, content: e.content,
    date: e.date, time: e.time, tags: e.tags, topic: e.topic,
    done: e.done, created_at: e.created_at,
  };
}
function toClientNote(e) {
  return {
    id: e.id, content: e.content, summary: e.summary,
    type: e.type, tags: e.tags, topic: e.topic, created_at: e.created_at,
  };
}

submitBtn.addEventListener("click", submitInput);

// ============ 输入模式切换 ============
function setInputMode(mode) {
  STATE.inputMode = mode;
  $("modeRecord").classList.toggle("active", mode === "record");
  $("modeAsk").classList.toggle("active", mode === "ask");
  submitBtn.classList.toggle("ask-mode", mode === "ask");
  submitBtn.textContent = mode === "record" ? "记下" : "问 AI";
  memoEl.placeholder = mode === "record"
    ? "按住下面棕色按钮直接说话，或者打字"
    : "想找以前说过的什么？比如：我说过腰疼吗";
  localStorage.setItem(STORAGE.INPUT_MODE, mode);
}
$("modeRecord").addEventListener("click", () => setInputMode("record"));
$("modeAsk").addEventListener("click", () => setInputMode("ask"));

// ============ 按住说话 ============
const voiceBtn = $("voice");
const voiceLabel = $("voiceLabel");
const recordingHint = $("recordingHint");
const recHintText = $("recHintText");
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null, recState = "idle", interimText = "", baseText = "";

function buildRecognition() {
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "zh-CN"; rec.continuous = true; rec.interimResults = true;
  rec.onresult = (event) => {
    let finalSeg = "", interimSeg = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) finalSeg += r[0].transcript;
      else interimSeg += r[0].transcript;
    }
    if (finalSeg) baseText = (baseText + finalSeg).replace(/\s+/g, "");
    interimText = interimSeg.replace(/\s+/g, "");
    memoEl.value = baseText + interimText;
    recHintText.textContent = (baseText + interimText).slice(-30) || "在听了…";
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      showToast("没有麦克风权限，去设置允许一下", true);
      stopRecording();
    } else if (e.error !== "no-speech") {
      showToast("识别出问题，再试一次", true);
    }
  };
  rec.onend = () => {
    if (recState === "recording") { try { rec.start(); } catch {} }
  };
  return rec;
}
function startRecording(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  if (!SR) { showToast("这台设备不支持语音", true); return; }
  if (recState === "recording") return;
  if (!recognition) recognition = buildRecognition();
  if (!recognition) return;
  recState = "recording";
  baseText = memoEl.value.trim();
  if (baseText && !/[，。、,.!?]$/.test(baseText)) baseText += "，";
  interimText = "";
  voiceBtn.classList.add("recording");
  voiceLabel.textContent = "松开发送";
  recordingHint.classList.add("show");
  recHintText.textContent = "在听了…";
  try { recognition.start(); } catch {}
}
function stopRecording(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  if (recState !== "recording") return;
  recState = "idle";
  voiceBtn.classList.remove("recording");
  voiceLabel.textContent = "按住说话";
  recordingHint.classList.remove("show");
  try { recognition && recognition.stop(); } catch {}
  const final = (baseText + interimText).trim();
  memoEl.value = final;
  interimText = "";
  setTimeout(() => { if (memoEl.value.trim()) submitInput(); }, 300);
}
voiceBtn.addEventListener("touchstart", startRecording, { passive: false });
voiceBtn.addEventListener("touchend", stopRecording, { passive: false });
voiceBtn.addEventListener("touchcancel", stopRecording, { passive: false });
voiceBtn.addEventListener("mousedown", startRecording);
voiceBtn.addEventListener("mouseup", stopRecording);
voiceBtn.addEventListener("mouseleave", stopRecording);
voiceBtn.addEventListener("contextmenu", e => e.preventDefault());

// ============ Tab 切换事件 ============
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => switchTab(t.dataset.tab));
});

// ============ 明日折叠 ============
const tomorrowHeader = $("tomorrowHeader");
const tomorrowList = $("tomorrowList");
function setTomorrowOpen(open) {
  tomorrowHeader.classList.toggle("expanded", open);
  tomorrowList.classList.toggle("expanded", open);
  tomorrowList.classList.toggle("collapsed", !open);
  localStorage.setItem(STORAGE.TOMORROW_OPEN, open ? "1" : "0");
}
tomorrowHeader.addEventListener("click", () => {
  setTomorrowOpen(!tomorrowList.classList.contains("expanded"));
});

// ============ 心事 tab 事件（事件代理）============
$("filterBar").addEventListener("click", async (e) => {
  if (e.target.classList && e.target.classList.contains("filter-tag")) {
    STATE.notesTagFilter = e.target.dataset.tag || "";
    await refreshNotes();
  }
  if (e.target.id === "exportBtn") {
    showExportMenu();
  }
});
$("notesList").addEventListener("click", (e) => {
  const item = e.target.closest(".note-item");
  if (item) item.classList.toggle("expanded");
});
$("loadMoreBtn").addEventListener("click", loadMoreNotes);

// 引用条目点击 → 切到心事 tab + 滚到那条
$("chatList").addEventListener("click", (e) => {
  const ref = e.target.closest(".ref-item");
  if (ref) {
    const id = ref.dataset.id;
    switchTab("notes");
    setTimeout(() => {
      const target = document.querySelector(`.note-item[data-id="${id}"]`);
      if (target) {
        target.classList.add("expanded");
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.style.animation = "fadeIn 0.6s ease";
      } else {
        showToast("这条不在最近的列表里，请加载更多", false);
      }
    }, 150);
  }
});

function showExportMenu() {
  const choice = prompt("导出哪种格式？输入：\n  md = Markdown\n  doc = Word（Word 能直接打开的 .doc）", "md");
  if (!choice) return;
  const f = choice.trim().toLowerCase();
  let format = "md";
  if (f === "doc" || f === "docx" || f === "word") format = "html";
  else if (f === "json") format = "json";
  window.open(`/api/export?format=${format}`, "_blank");
}

// ============ 通知 ============
const notifBanner = $("notifBanner");
$("notifEnable").addEventListener("click", async () => {
  notifBanner.classList.remove("show");
  localStorage.setItem(STORAGE.NOTIF_DECISION, "asked");
  if ("Notification" in window) {
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        await subscribeForServerPush();
        scheduleLocalNotifications();
        showToast("提醒已开启 ✓");
      }
    } catch (e) {}
  }
});
$("notifSkip").addEventListener("click", () => {
  notifBanner.classList.remove("show");
  localStorage.setItem(STORAGE.NOTIF_DECISION, "skipped");
});
function maybeShowNotifBanner() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") return;
  if (Notification.permission === "denied") return;
  if (localStorage.getItem(STORAGE.NOTIF_DECISION)) return;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
                   || window.navigator.standalone === true;
  if (!isStandalone) return;
  notifBanner.classList.add("show");
}

function scheduleLocalNotifications() {
  STATE.scheduledTimers.forEach(t => clearTimeout(t));
  STATE.scheduledTimers = [];
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const today = todayStr();
  const due = STATE.today.filter(x => x.time && x.date === today);
  for (const t of due) {
    const [h, m] = t.time.slice(0, 5).split(":").map(Number);
    const fireAt = new Date(); fireAt.setHours(h, m, 0, 0);
    const delay = fireAt.getTime() - now.getTime();
    if (delay <= 0 || delay > 24 * 3600 * 1000) continue;
    const timer = setTimeout(() => fireNotification(t.title, t.time.slice(0, 5)), delay);
    STATE.scheduledTimers.push(timer);
  }
}
async function fireNotification(title, time) {
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("该提醒了", {
        body: `${time}　${title}`, icon: "/icon-192.png", badge: "/icon-192.png",
        tag: `task-${time}-${title}`, requireInteraction: true,
      });
      return;
    }
  } catch {}
  try { new Notification("该提醒了", { body: `${time}　${title}`, icon: "/icon-192.png" }); } catch {}
}

// ============ 服务端推送订阅 ============
async function subscribeForServerPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const keyResp = await fetch("/api/vapid-key");
    if (!keyResp.ok) return;
    const { publicKey } = await keyResp.json();
    if (!publicKey) return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch (e) { console.warn("服务端推送订阅失败", e); }
}
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

// ============ Service Worker ============
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(() => {
    if (Notification.permission === "granted") subscribeForServerPush();
  }).catch(err => console.warn("SW 注册失败", err));
}

// ============ 启动 ============
function init() {
  $("todayLabel").textContent = formatDateLabel();
  loadChat();
  renderChat();
  // 恢复上次的输入模式
  const savedMode = localStorage.getItem(STORAGE.INPUT_MODE);
  if (savedMode === "ask") setInputMode("ask"); else setInputMode("record");
  // 恢复明日折叠状态（默认收起）
  setTomorrowOpen(localStorage.getItem(STORAGE.TOMORROW_OPEN) === "1");
  loadInitial();
  maybeShowNotifBanner();

  setInterval(() => {
    $("todayLabel").textContent = formatDateLabel();
    renderTasks();
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      loadInitial();
      maybeShowNotifBanner();
    }
  });
}
init();
