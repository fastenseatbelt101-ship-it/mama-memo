// 离线 harness：测纯函数逻辑（不调外部 API，不需要 Supabase/Kimi）
// 涵盖：scoring、ranking、classification 输出清洗
// 用途：每次代码改动先跑这个，再跑 harness-live

import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(__dirname, "..");

// 把 fetch mock 掉，让 parser 不真的调 DeepSeek
let mockResponses = [];
globalThis.fetch = async (url, opts) => {
  if (mockResponses.length === 0) throw new Error("mockResponses 没东西可弹");
  const next = mockResponses.shift();
  const body = typeof next === "string" ? next : JSON.stringify(next);
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};

const env = { DEEPSEEK_API_KEY: "fake-for-mock" };

const { classifyAndExtract, parseQueryIntent, rerankAndAnswer } =
  await import(resolvePath(ROOT, "api/_lib/parser.js").replaceAll("\\","/"));

let passed = 0, failed = 0;
function expect(cond, name) {
  if (cond) { console.log(`\x1b[32m  ✓ ${name}\x1b[0m`); passed++; }
  else      { console.log(`\x1b[31m  ✗ ${name}\x1b[0m`); failed++; }
}
function pushMockKimi(body) {
  mockResponses.push({ choices: [{ message: { content: JSON.stringify(body) } }] });
}

console.log("\n═════════ 离线 harness ═════════\n");

// ---- 测 1：classifyAndExtract 输出清洗 ----
console.log("【classifyAndExtract】清洗与字段保护:");
pushMockKimi({
  type: "task",
  tags: ["健康","身体","健康","太长太长太长太长太长太长","x"],  // 含重复、超长
  topic: "身体不适",
  summary: "腰疼应该去看医生",
  tasks: [{ title:"去看医生", date:"2026-05-12", time:"10:00" }],
});
const out1 = await classifyAndExtract("明天上午十点去医院", env);
expect(out1.type === "task", "type=task");
expect(Array.isArray(out1.tags) && out1.tags.length <= 5, "tags ≤5");
expect(out1.topic === "身体不适", "topic 保留");
expect(out1.tasks.length === 1, "tasks 数量正确");
expect(out1.tasks[0].time === "10:00", "task time 正确");

pushMockKimi({ type:"BOGUS", tags:"not-array", topic: 123, summary: null, tasks:[] });
const out2 = await classifyAndExtract("test", env);
expect(out2.type === "other", "非法 type 兜底为 other");
expect(Array.isArray(out2.tags) && out2.tags.length === 0, "非法 tags → 空数组");
expect(out2.topic === null, "非法 topic → null");

// ---- 测 2：parseQueryIntent ----
console.log("\n【parseQueryIntent】:");
pushMockKimi({ keywords:["腰疼","腰"], tags:["健康"], fromDays: 30 });
const intent1 = await parseQueryIntent("我前阵子说过腰疼吗", env);
expect(intent1.keywords.length === 2, "keywords 数量");
expect(intent1.tags.includes("健康"), "tags 含健康");
expect(intent1.fromDays === 30, "fromDays 30");

// 失败兜底
pushMockKimi({ keywords:[], tags:[] });  // 空
const intent2 = await parseQueryIntent("xx", env);
expect(intent2.keywords.length >= 1, "空响应时兜底关键词");

// ---- 测 3：rerankAndAnswer ----
console.log("\n【rerankAndAnswer】:");
const candidates = [
  { id:"a", content:"腰疼", ai_summary:"腰疼", type:"thought", tags:["健康"], created_at:"2026-05-08T03:00:00Z" },
  { id:"b", content:"看电视", ai_summary:"看电视", type:"thought", tags:[], created_at:"2026-05-09T03:00:00Z" },
  { id:"c", content:"睡不好", ai_summary:"睡不好", type:"thought", tags:["健康"], created_at:"2026-05-10T03:00:00Z" },
];
pushMockKimi({ answer:"你说过腰疼和睡不好", relevantIndexes:[1,3] });
const res = await rerankAndAnswer("身体怎么样", candidates, env);
expect(res.relevantIds.length === 2, "返回 2 个相关 ids");
expect(res.relevantIds.includes("a") && res.relevantIds.includes("c"), "包含 a 和 c");

// 空候选
mockResponses.length = 0;
const empty = await rerankAndAnswer("...", [], env);
expect(empty.relevantIds.length === 0, "空候选返回空");
expect(empty.answer.length > 0, "空候选有兜底答案");

console.log(`\n────── 通过 ${passed} / 失败 ${failed} ──────\n`);
if (failed > 0) process.exit(1);
