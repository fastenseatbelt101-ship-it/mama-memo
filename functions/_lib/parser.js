// Kimi (Moonshot) 调用：把妈妈的自然语言抽取成结构化任务
// 输入："明天上午十点去医院体检，下午三点开会"
// 输出：{ tasks: [{ title, date, time }, ...] }

export async function parseWithAI(rawText, env) {
  const apiKey = env.KIMI_API_KEY;
  if (!apiKey) {
    throw new Error("KIMI_API_KEY 未配置");
  }

  // 给 AI 当前日期上下文
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 3600 * 1000);
  const y = beijing.getUTCFullYear();
  const m = String(beijing.getUTCMonth() + 1).padStart(2, "0");
  const d = String(beijing.getUTCDate()).padStart(2, "0");
  const wd = ["日","一","二","三","四","五","六"][beijing.getUTCDay()];
  const todayStr = `${y}-${m}-${d}`;
  const todayLabel = `${todayStr}（周${wd}）`;

  const systemPrompt = `你是一个温柔耐心的时间助手，专门帮一位中老年妈妈整理她随口记下的备忘事项。

任务：把用户的一段中文输入，拆解成一个或多个"待办任务"，每个任务抽取：
- title: 任务的简洁标题（去掉时间词，只保留要做的事，10 字以内最佳）
- date: 任务发生的日期，格式 YYYY-MM-DD；如果原文没有日期信息，填 null
- time: 任务发生的具体时间点，格式 HH:MM（24 小时制）；如果原文没有时间信息，填 null

当前日期是 ${todayLabel}。所有相对时间（今天/明天/后天/下周三/月底）都基于这个日期来推算。

注意事项：
1. 一句话里如果包含多件事（"上午开会下午接孩子"），要拆成多个任务。
2. "上午"通常指 09:00，"中午"指 12:00，"下午"指 15:00，"晚上"指 19:00——但只在用户没说具体几点时使用，作为兜底。
3. "上午九点"= 09:00，"下午三点"= 15:00，"下午三点半"= 15:30。
4. "周五之前"这种 deadline，date 填那个周五的日期，time 填 null。
5. 如果用户的话里完全没有时间或日期信息（比如"记得买酱油"），date 和 time 都填 null，title 就是这件事本身。
6. 严格只输出 JSON，不要任何解释、markdown 标记。

输出格式（严格 JSON）：
{"tasks":[{"title":"...","date":"YYYY-MM-DD"或null,"time":"HH:MM"或null}]}`;

  const resp = await fetch("https://api.moonshot.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "moonshot-v1-8k",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawText }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Kimi API 错误 ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "{}";

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`Kimi 返回的不是合法 JSON: ${content}`);
  }

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    return { tasks: [] };
  }

  const cleaned = parsed.tasks
    .filter(t => t && typeof t.title === "string" && t.title.trim())
    .map(t => ({
      title: t.title.trim(),
      date: validDate(t.date) ? t.date : null,
      time: validTime(t.time) ? t.time : null
    }));

  return { tasks: cleaned };
}

function validDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function validTime(s) {
  return typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
}
