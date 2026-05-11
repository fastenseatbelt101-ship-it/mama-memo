// DeepSeek 调用：3 个 AI 函数
const KIMI_URL = "https://api.deepseek.com/v1/chat/completions";
const MODEL = "deepseek-chat";

// 妈妈生活的 6 个固定 topic
const TOPICS = ["读书会", "吉他学习", "人情世故", "随想随记", "身体", "家庭关系"];
const TOPICS_LIST = TOPICS.map(t => `"${t}"`).join("、");

async function callKimi(messages, env, opts = {}) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置");
  const resp = await fetch(KIMI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 0.1,
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API 错误 ${resp.status}: ${errText}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(content); }
  catch { throw new Error(`DeepSeek 返回非 JSON: ${content}`); }
}

function todayLabel() {
  const beijing = new Date(Date.now() + 8 * 3600 * 1000);
  const y = beijing.getUTCFullYear();
  const m = String(beijing.getUTCMonth() + 1).padStart(2, "0");
  const d = String(beijing.getUTCDate()).padStart(2, "0");
  const wd = ["日","一","二","三","四","五","六"][beijing.getUTCDay()];
  return `${y}-${m}-${d}（周${wd}）`;
}

// ================================
// 1. 分类 + 抽取（type + topic + tags + summary）
// ================================
export async function classifyAndExtract(rawText, env) {
  const systemPrompt = `你是一位中老年妈妈的贴身整理助手。她会随口说出各种内容，你的任务是输出严格 JSON 格式的结构化整理结果。

当前日期是 ${todayLabel()}。所有相对时间（今天/明天/后天/下周三）都基于此推算。

输出 JSON 字段：

1. type: 结构类型，从下列六个里选一个：
   - "task"     ：明确的待办事项（"明天三点开会"）
   - "thought"  ：心事、感悟、情绪、对身体的觉察、对生活的反思
   - "shopping" ：要买的东西
   - "idea"     ：突然冒出的想法、点子、计划
   - "link"     ：网址 / 看到的文章
   - "other"    ：以上都不适合

2. topic: 这条内容归属的生活领域，**必须从下列 6 个里选 1 个**：
   - "读书会"   ：参加读书会、看书、讨论书、读后感
   - "吉他学习" ：练琴、吉他课、和弦、练习曲、乐器相关
   - "人情世故" ：朋友/同学/同事/邻居的交往、应酬、社交场合、送礼、回访等"和外人打交道"的事
   - "身体"     ：身体感觉、健康、看病、就医、症状、睡眠、饮食、运动
   - "家庭关系" ：丈夫/孩子/孙子/父母/兄弟姐妹相关的事、家里的事、给家人买东西
   - "随想随记" ：日记、随笔、天气、心情、灵感、其它各种零碎想法 —— 任何归不进上面 5 个的都放这里

3. tags: 3-5 个标签数组，**必须同时包含**：
   - 至少 1 个**广义标签**（覆盖大概念，如 "健康"/"身体"/"日程"/"购物"/"学习"/"社交"/"家人"）
   - 至少 1 个**狭义标签**（具体细节，如 "腰疼"/"失眠"/"吉他和弦"/"读书会"）
   - 这样保证以后用宽泛词或精确词都能搜到

4. summary: ≤30 字的一句话摘要，第三人称

5. tasks: 数组。仅 type='task' 时填，每个含 title/date/time
   - "上午"≈09:00, "中午"≈12:00, "下午"≈15:00, "晚上"≈19:00（兜底）
   - "上午九点"=09:00, "下午三点半"=15:30
   - 一句话含多件事就拆成多个 task
   - type≠'task' 时 tasks=[]

严格只输出 JSON，不要任何解释。

举例：
- 输入"今天感觉腰有点疼" → {"type":"thought","topic":"身体","tags":["健康","身体","腰疼"],"summary":"腰部疼痛","tasks":[]}
- 输入"晚上睡得不好老醒" → {"type":"thought","topic":"身体","tags":["健康","身体","睡眠","失眠"],"summary":"睡眠不好"...}
- 输入"和老李喝茶下午三点" → {"type":"task","topic":"人情世故","tags":["社交","日程","喝茶","老李"],"summary":"下午与老李喝茶","tasks":[...]}
- 输入"练习曲弹了三遍" → {"type":"thought","topic":"吉他学习","tags":["学习","吉他","练习"],"summary":"练习曲反复练"...}
- 输入"读书会聊了《活着》" → {"type":"thought","topic":"读书会","tags":["阅读","读书会","活着"],"summary":"读书会讨论活着"...}
- 输入"婆婆又催着回家" → {"type":"thought","topic":"家庭关系","tags":["家人","家庭","婆婆"],"summary":"婆婆催回家"...}`;

  const parsed = await callKimi(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: rawText },
    ],
    env,
    { temperature: 0.1 }
  );

  const validTypes = new Set(["task","thought","shopping","idea","link","other"]);
  const type = validTypes.has(parsed.type) ? parsed.type : "other";

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter(t => typeof t === "string" && t.trim() && t.length <= 12).map(t => t.trim()).slice(0, 6)
    : [];

  // topic 必须从 6 个里选；不在则默认随想随记
  const topic = (typeof parsed.topic === "string" && TOPICS.includes(parsed.topic.trim()))
    ? parsed.topic.trim()
    : "随想随记";

  const summary = (typeof parsed.summary === "string" && parsed.summary.trim())
    ? parsed.summary.trim().slice(0, 60)
    : null;

  let tasks = [];
  if (type === "task" && Array.isArray(parsed.tasks)) {
    tasks = parsed.tasks
      .filter(t => t && typeof t.title === "string" && t.title.trim())
      .map(t => ({
        title: t.title.trim().slice(0, 100),
        date: validDate(t.date) ? t.date : null,
        time: validTime(t.time) ? t.time : null,
      }));
  }

  return { type, tags, topic, summary, tasks };
}

function validDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function validTime(s) { return typeof s === "string" && /^\d{2}:\d{2}$/.test(s); }

// ================================
// 2. 检索意图解析（扩展：多关键词同义词 + 候选 topic）
// ================================
export async function parseQueryIntent(rawQuery, env) {
  const systemPrompt = `用户在向她的备忘录提问。把这个问题转换为检索参数。

输出严格 JSON：
{
  "keywords": ["主词", "近义词1", "近义词2", ...],   // 3-6 个，含同义改写
  "tags":     ["...", "..."],                         // 2-5 个，含广义和狭义
  "topics":   ["...", ...],                           // 可能命中的领域，从下面 6 选 0-3 个
  "fromDays": 30
}

固定 topic 候选（${TOPICS_LIST}）：
- "读书会"：阅读、看书、读后感、书目
- "吉他学习"：练琴、吉他、和弦、乐器
- "人情世故"：朋友/同事/邻居等社交、应酬、送礼、回访
- "身体"：身体感觉、健康、看病、症状、睡眠、饮食、运动
- "家庭关系"：丈夫/孩子/孙子/父母等家里人、家务、家事
- "随想随记"：天气、心情、零碎想法

规则：
- keywords 要扩展同义词，例如"身体"→["身体","健康","状态","不舒服"]，"安排"→["安排","计划","日程","事","要做"]
- tags 同时含广义和狭义。例如查"睡眠"→tags=["健康","身体","睡眠","失眠"]
- topics 是可能命中的领域，可以填多个；不能确定就填 ["随想随记"] 或空数组
- fromDays："前阵子"=30 "最近"=14 "上周"=7 "这两天"=3 没说=30，"几个月前"=90

例：
"我前阵子说过腰疼吗" → {"keywords":["腰疼","腰","腰部","痛","酸"],"tags":["健康","身体","腰疼"],"topics":["身体"],"fromDays":30}
"我最近身体怎么样" → {"keywords":["身体","健康","状态","不舒服"],"tags":["健康","身体"],"topics":["身体"],"fromDays":14}
"今天有什么安排" → {"keywords":["安排","计划","日程","事"],"tags":["日程","计划"],"topics":[],"fromDays":1}
"我说过想学画画吗" → {"keywords":["画画","学","学习","兴趣"],"tags":["兴趣","学习"],"topics":["随想随记"],"fromDays":60}
"读书会聊过什么" → {"keywords":["读书会","书","讨论"],"tags":["阅读","读书会"],"topics":["读书会"],"fromDays":60}
"我练得怎么样" → {"keywords":["练","弹","和弦","吉他","进度"],"tags":["学习","吉他","练习"],"topics":["吉他学习"],"fromDays":30}

严格只输出 JSON。`;

  let parsed;
  try {
    parsed = await callKimi(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawQuery },
      ],
      env,
      { temperature: 0.0 }
    );
  } catch {
    return { keywords: [rawQuery.slice(0, 10)], tags: [], topics: [], fromDays: 30 };
  }

  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.filter(k => typeof k === "string" && k.trim()).slice(0, 8)
    : [];
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter(k => typeof k === "string" && k.trim()).slice(0, 8)
    : [];
  const topics = Array.isArray(parsed.topics)
    ? parsed.topics.filter(t => typeof t === "string" && TOPICS.includes(t.trim())).slice(0, 3)
    : [];
  const fromDays = Number.isFinite(parsed.fromDays) && parsed.fromDays > 0
    ? Math.min(parsed.fromDays, 365)
    : 30;

  if (keywords.length === 0) keywords.push(rawQuery.slice(0, 20));
  return { keywords, tags, topics, fromDays };
}

// ================================
// 3. AI 重排 + 答案生成
// ================================
export async function rerankAndAnswer(query, candidates, env) {
  if (candidates.length === 0) {
    return { answer: "我翻了一下，没找到关于这个的记录。", relevantIds: [] };
  }
  const top = candidates.slice(0, 30);

  const candidatesText = top.map((c, i) => {
    const date = c.created_at ? c.created_at.slice(0, 10) : "";
    const tags = Array.isArray(c.tags) ? c.tags.join(",") : "";
    return `[${i + 1}] (${date}) [${c.type}/${c.topic||""}] tags:${tags}\n  原话：${c.content}\n  摘要：${c.ai_summary || ""}`;
  }).join("\n\n");

  const systemPrompt = `你在帮一位中老年妈妈翻她过去说过的话。给定她现在的问题和过去的备忘录条目，你要：
1. 找出真的与问题相关的条目，用 [编号] 引用
2. 用温柔的口吻回答（≤80 字）
3. 严格只输出 JSON

格式：{"answer":"你 5 月 7 号说过腰疼...","relevantIndexes":[3,7]}

如果没相关条目，answer 写"我翻了一下，没找到关于这个的记录"，relevantIndexes=[]。`;

  const userMsg = `妈妈的问题："${query}"\n\n过去的备忘录条目：\n\n${candidatesText}`;

  let parsed;
  try {
    parsed = await callKimi(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      env,
      { temperature: 0.1 }
    );
  } catch {
    return {
      answer: "AI 回答时出了点问题，但下面是匹配到的相关记录：",
      relevantIds: top.map(c => c.id),
    };
  }

  const answer = (typeof parsed.answer === "string" && parsed.answer.trim())
    ? parsed.answer.trim()
    : "下面是相关的记录：";
  const relevantIndexes = Array.isArray(parsed.relevantIndexes)
    ? parsed.relevantIndexes.filter(n => Number.isInteger(n) && n >= 1 && n <= top.length)
    : [];
  const relevantIds = relevantIndexes.map(idx => top[idx - 1].id);

  return { answer, relevantIds };
}

export const TOPIC_LIST = TOPICS;
