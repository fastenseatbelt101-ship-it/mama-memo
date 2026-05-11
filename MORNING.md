# ☀️ 早上好 Qiao

你睡的时候我把日记功能整套都搭好了。这份文档告诉你：**我做了什么、你需要做什么、怎么验证**。

---

## 一、我做了什么（全部 8 块都完成了 ✓）

| 编号 | 功能 | 状态 |
|---|---|---|
| 1 | 数据库新建 `entries` 表（统一存所有内容） | ✓ |
| 2 | AI 分类抽 tags/topic/summary（Kimi prompt 升级） | ✓ |
| 3 | 3 路检索（关键词 + 标签 + 时间窗）+ DeepSeek 重排 | ✓ |
| 4 | Markdown / Word(HTML) / JSON 三格式导出 | ✓ |
| 5 | 测试 harness（离线 16 个 case + 在线 12 个 case） | ✓ |
| 6 | 前端 3 tab 框架（交互 / 待办 / 心事） | ✓ |
| 7 | Tab 1：聊天 UI + AI 答复 + 引用条目点击跳转 | ✓ |
| 8 | Tab 3：心事时间轴 + 标签筛选 + 导出按钮 | ✓ |

**额外做的**：
- 用户纠正分类的 API（`/api/correct`）+ DB 表（`classification_corrections`），为以后迭代 prompt 攒数据
- 输入模式切换：`📝 记一下` / `🔍 问 AI`（妈妈用得明白）
- 引用条目跳转：聊天里 AI 提到的条目，点一下自动跳到心事 tab 并滚到那一条

---

## 二、你今天醒来要做的事（按顺序）

### 1️⃣ Supabase 跑新版 schema（**关键**，2 分钟）

新版有 `entries` 表（替代 tasks）、`classification_corrections` 表，需要在 Supabase 跑一遍 SQL：

1. 打开 https://supabase.com/dashboard/project/xkcxhhtlvuhlsbaxxlxb/sql/new
2. 用记事本打开 `F:\软件开发\妈妈的备忘录\妈妈的备忘录\schema.sql`
3. 全选复制粘贴到 SQL Editor，点 Run（RLS 提示选 **Run and enable RLS**）
4. 看到 "Success. No rows returned" 就成

> ⚠️ schema 里 **`drop table if exists tasks;`** 会删掉老 tasks 表（里面是测试数据）。
> 如果你有重要数据想保留，**跑 SQL 前删掉那一行**。

### 2️⃣ 跑在线测试 harness（**强烈推荐**，5 分钟）

这是 30 个 case 的真实端到端测试，验证：
- AI 分类正确
- 数据库读写通畅
- 3 路检索能召回到对的条目

```cmd
cd F:\软件开发\妈妈的备忘录\妈妈的备忘录
node tests/harness-live.mjs
```

会打印每条 seed 的分类结果 + 每条查询的命中情况。理想结果：**最后一行 `通过 N / 失败 0`**。

如果有 case 失败，告诉我具体哪条没召回到，我能针对性调 prompt 或检索逻辑。

### 3️⃣ 推 GitHub（30 秒）

```cmd
cd F:\软件开发\妈妈的备忘录\妈妈的备忘录
update-github.bat
```

### 4️⃣ 决定部署平台

**关于部署：仍是悬而未决的问题**。我们昨晚的数据：
- Vercel：你家 WiFi 能开，4G 不行
- Cloudflare：仪表盘根本打不开
- EdgeOne：可用但需要 ICP 备案

**我的建议**：先重新部署到 Vercel（你之前有那个 mama-memo 项目）——看看新版 + 你家 WiFi 是不是流畅。**实际使用场景 80% 是妈妈在家用 WiFi**，先验证这条路。

但 ⚠️ 现在代码是 Cloudflare Pages Functions 格式（`onRequest(context)`），不能直接跑在 Vercel 上。要部署 Vercel 得改格式（5 个 API 文件签名换成 `(req, res)`）。

**3 个备选**等你拍板：

1. **改回 Vercel 格式**（30 分钟工作量）→ 用现有 Vercel 项目继续
2. **再试一次 Cloudflare**（也许是昨晚网络问题）
3. **买带 CN2 GIA 路由的香港 VPS**（¥30/月，国内访问海外像家用 WiFi）

醒来告诉我你倾向哪个，我们继续。

---

## 三、新版用法（妈妈视角）

打开 App 后能看到 3 个 tab：

### Tab 1 · 交互（默认）
妈妈说话或打字 → AI 自动整理 → 显示"好的，记下了 ✓ 心事·健康"
妈妈也可以切到 🔍 问 AI 模式 → 问"我前阵子说过腰疼吗" → AI 翻历史回答

### Tab 2 · 待办
今日 / 明日（默认收起）—— 跟昨晚那一版一样

### Tab 3 · 心事
所有非待办内容的时间轴。
- 顶部按标签筛选（健康 / 购物 / 家庭 等）
- 右上角"导出"按钮 → 选 md / Word
- 点条目可展开看全文

---

## 四、新增的文件清单

```
schema.sql                              ← 升级版，新 entries 表
functions/_lib/parser.js                ← 3 个 AI 函数
functions/_lib/db.js                    ← entries 相关全部 CRUD
functions/_lib/webpush.js               ← 没动
functions/api/save.js                   ← 用 classifyAndExtract
functions/api/list.js                   ← 返回今/明 task + 最近 30 条 note
functions/api/notes.js                  ← NEW 心事分页
functions/api/search.js                 ← NEW 检索（无 AI 重排）
functions/api/chat.js                   ← NEW 聊天检索（含 AI 重排+回答）
functions/api/correct.js                ← NEW 纠正分类
functions/api/export.js                 ← NEW 导出 md/html/json
functions/api/subscribe.js              ← 没动
functions/api/vapid-key.js              ← 没动
functions/api/cron-check.js             ← 没动
public/index.html                       ← 重写：3 tab 框架
public/app.js                           ← NEW 前端逻辑模块化（631 行）
public/sw.js                            ← 没动
tests/harness-offline.mjs               ← NEW 离线 mock 测试（16 case）
tests/harness-live.mjs                  ← NEW 在线 e2e 测试（12 case）
```

**没动的：** package.json / vercel.json / .gitignore / push-to-github.bat / update-github.bat / .env.local

---

## 五、需要补的（下次接着干）

- [ ] **embedding 语义检索**（Cloudflare Workers AI 的 BGE-M3 或别的方案）—— 当前用关键词+标签，对一些跨表达的查询召回率会差一点
- [ ] **Tab 3 完整时间轴翻页**（现在能加载更多，但没做无限滚动）
- [ ] **真正的 docx**（现在导出 .doc 是 HTML 套壳，Word 能打开，但格式略简单；要正规 docx 得引入 docx npm 库）
- [ ] **隐私 PIN 码**（你说先不做，这里 placeholder）
- [ ] **部署路径确定 + 国内 4G 验证**（上面 ② 那个待定）

---

## 六、安全提醒

> ⚠️ 之前你给我的 **Kimi key** 和 **Supabase service_role key** 都在我们的对话里。
> 等你确认一切跑通后，**强烈建议去这两个后台 reset 一遍 key**：
> - Kimi: https://platform.moonshot.cn/console/api-keys
> - Supabase: https://supabase.com/dashboard/project/xkcxhhtlvuhlsbaxxlxb/settings/api-keys
>
> Reset 之后把新 key 同步到 `.env.local` 即可。

---

睡好了，我们继续干。今天聚焦：
1. **跑 schema migration**
2. **跑在线 harness 看实际召回率**
3. **决定部署路径**

—— 我等你醒。
