# 妈妈的备忘录

一个温柔的备忘录：妈妈对着说话或打字，AI 自动整理出"今天要做什么"和"明天要做什么"。打开网页就看见，不用动脑子分类。

---

## 0. 这是个啥

```
妈妈的 iPhone Safari
        │
        │ 输入"明天上午十点去医院"
        ▼
┌──────────────────┐
│   Vercel         │
│   ┌────────┐     │      ┌──────────────┐
│   │ 网页   │     │ ────►│   Kimi AI    │
│   │ + API  │     │      │   解析时间   │
│   └────────┘     │      └──────────────┘
│       │          │
│       ▼          │      ┌──────────────┐
│   写数据 ─────── │ ────►│   Supabase   │
└──────────────────┘      │   存任务     │
                          └──────────────┘
```

- **Vercel**：跑代码的服务器（免费）
- **Supabase**：存数据的数据库（免费）
- **Kimi**：理解"明天三点"这种话的 AI（你已经有 key 了）

---

## 1. 文件结构（建好以后是这样）

```
妈妈的备忘录/
├── public/
│   ├── index.html          ← 妈妈打开看到的页面
│   ├── manifest.json       ← PWA 配置（加到主屏幕用）
│   ├── icon-192.png        ← 图标
│   ├── icon-512.png
│   └── apple-touch-icon.png
├── api/
│   ├── _lib/
│   │   ├── kimi.js         ← Kimi 调用封装
│   │   └── db.js           ← Supabase 客户端
│   ├── save.js             ← POST 保存接口
│   └── list.js             ← GET 查询接口
├── schema.sql              ← Supabase 建表 SQL
├── package.json
├── vercel.json
├── .env.local.example      ← 环境变量模板
├── .gitignore
└── README.md               ← 你正在看的这个
```

---

## 2. 部署步骤（按顺序做，全程 30-40 分钟）

### 2.1 注册三个账号（5 分钟）

| 服务 | 网址 | 登录方式 | 用途 |
|---|---|---|---|
| GitHub | https://github.com | 邮箱注册 | 代码托管（中转站） |
| Vercel | https://vercel.com | 用 GitHub 登录 | 跑代码 |
| Supabase | https://supabase.com | 用 GitHub 登录 | 存数据 |

> 💡 三个全都用 GitHub 登录，一根账号体系，省事。

### 2.2 在 Supabase 创建项目（5 分钟）

1. 登录 Supabase → "New Project"
2. 起名随意（比如 `mama-memo`），地区选 **Tokyo / Singapore**（最近）
3. 数据库密码自动生成的就行，**复制保存到密码管理器**
4. 等 1-2 分钟项目初始化
5. 进项目 → 左边找 **SQL Editor** → 粘贴 `schema.sql` 全部内容 → 点 **Run**
6. 应该看到 "Success" 字样
7. 左边找 **Settings → API**，记下两个值：
   - `Project URL`（形如 `https://xxxxxxxx.supabase.co`）
   - `service_role` key（点击 reveal，**这个 key 是后端专用，不能放前端**）

### 2.3 本地跑起来试试（10 分钟）

需要你电脑上有 Node.js（如果没有，去 https://nodejs.org 下载 LTS 版安装）。

打开终端，进项目目录：

```bash
cd F:\软件开发\妈妈的备忘录\妈妈的备忘录

# 装依赖
npm install

# 装 Vercel CLI（用于本地起服务）
npm install -g vercel

# 复制环境变量模板，然后改成真实的值
copy .env.local.example .env.local
notepad .env.local
```

把 `.env.local` 里三个值都填上：

```
DEEPSEEK_API_KEY=sk-你的Kimi-key
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...一长串
```

然后启动本地服务：

```bash
vercel dev
```

第一次跑会问你登录 Vercel（按提示来），登录后会自动起服务在 `http://localhost:3000`。

浏览器打开 `http://localhost:3000`，输入"明天上午十点去医院"试试，看：
- 提示框显示"已记下，明天的事 ✓"
- "明日预告"区出现"10:00 去医院"
- Supabase 后台 → Table Editor → tasks 表 里能看到这条记录

### 2.4 部署到 Vercel（10 分钟）

**第 1 步：把代码推到 GitHub**

```bash
cd F:\软件开发\妈妈的备忘录\妈妈的备忘录
git init
git add .
git commit -m "妈妈的备忘录初版"

# 在 GitHub 网站上点 New repository，名字随便比如 mama-memo，建空仓库（不要勾 README）
# 建完会给你一个 URL，比如 https://github.com/your-name/mama-memo.git

git remote add origin https://github.com/你的用户名/mama-memo.git
git branch -M main
git push -u origin main
```

**第 2 步：Vercel 关联仓库**

1. Vercel 首页 → "Add New..." → "Project"
2. 选刚才那个 GitHub 仓库 `mama-memo` → Import
3. **Configure Project** 页面，展开 "Environment Variables"，加三个：
   - `DEEPSEEK_API_KEY` = `sk-...`
   - `SUPABASE_URL` = `https://xxx.supabase.co`
   - `SUPABASE_SERVICE_KEY` = `eyJ...`
4. 点 **Deploy**
5. 等 1-2 分钟，会给你一个网址，类似 `https://mama-memo-xxx.vercel.app`

**第 3 步：试一下**

在你电脑浏览器打开那个网址，输入测试一句，看后台数据有没有进 Supabase。

### 2.5 让妈妈用上（2 分钟）

把 Vercel 给的网址发给妈妈：

> 妈，把这个链接发给你，用 Safari 打开就行：
> `https://mama-memo-xxx.vercel.app`
>
> 然后点 Safari 底部中间那个 ⬆️ 分享按钮，往下滑找到「添加到主屏幕」，
> 桌面就会有个图标，点开就能用。
> 想说啥就直接说，键盘上点🎤可以语音输入。

---

## 3. 后续要加的功能

我们现在做完了"输入 + 自动整理 + 今日/明日"这一坨，用起来已经够用。

接下来还差这两块（你拍板要不要加）：
- [ ] **历史回看**：滑动看以前几天的所有记录（帮妈妈找"我前阵子说要交水电费来着"）
- [ ] **打勾完成**：任务做完了点一下打勾
- [ ] **跨天提醒**：每晚 22:00 用 Server酱推一条"明天有 X 件事"到妈妈微信（如果以后想加推送）

---

## 4. 出问题时怎么排查

**网页能开但提示"出问题了"？**
- 先看浏览器控制台（电脑上 F12 → Console）有什么红字
- 多半是环境变量没配对：去 Vercel → Project Settings → Environment Variables 检查

**Kimi 没正确解析时间？**
- 看 Vercel → 项目 → Logs，能看到每次 API 调用的详细出错信息
- 如果是配额耗尽，去 Kimi 后台看额度

**Supabase 写不进去？**
- 检查 SUPABASE_SERVICE_KEY 用的是 `service_role` 那个，不是 `anon`
- 检查 schema.sql 是不是真的执行了（Table Editor 里要能看到 tasks 表）

---

写代码的人：Claude（我）
要拍板的人：Qiao
最终用户：Qiao 的妈妈 ❤️
