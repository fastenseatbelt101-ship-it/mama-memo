// 在线 harness：真连 Supabase + DeepSeek
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(__dirname, "..");

async function loadEnv() {
  const path = resolvePath(ROOT, ".env.local");
  let txt;
  try { txt = await readFile(path, "utf-8"); }
  catch { console.error("找不到 .env.local"); process.exit(2); }
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  for (const k of ["DEEPSEEK_API_KEY","SUPABASE_URL","SUPABASE_SERVICE_KEY"]) {
    if (!env[k]) { console.error(`.env.local 缺少 ${k}`); process.exit(2); }
  }
  return env;
}

const env = await loadEnv();
const parserPath = pathToFileURL(resolvePath(ROOT, "api/_lib/parser.js")).href;
const dbPath = pathToFileURL(resolvePath(ROOT, "api/_lib/db.js")).href;
const { classifyAndExtract, parseQueryIntent } = await import(parserPath);
const db = await import(dbPath);

// Seeds 覆盖 6 个 topic 各 2-3 条
const SEEDS = [
  // 身体 (0-2)
  "今天感觉腰有点疼，是不是该去看医生了",
  "晚上睡得不好，老醒过来",
  "感觉最近吃饭没什么胃口",
  // 读书会 (3-4)
  "读书会上聊了《活着》这本书",
  "下周读书会要选下个月的书目",
  // 吉他学习 (5-6)
  "今天练了三遍《童年》的和弦",
  "下周三晚上七点吉他课",
  // 人情世故 (7-8)
  "下午三点和老李喝茶",
  "邻居王阿姨送来了她孙子的喜饼",
  // 家庭关系 (9-10)
  "想给孙子买双新球鞋，他说脚长大了",
  "周末儿子说要带孙子回来吃饭",
  // 随想随记 (11-12)
  "今天天气真好，心情也跟着好起来",
  "https://example.com 看到一篇关于退休理财的文章",
];

const CASES = [
  // 身体类查询
  { query: "我最近身体怎么样", mustInclude: [0, 1, 2] },
  { query: "腰疼", mustInclude: [0] },
  { query: "腰部不舒服", mustInclude: [0] },
  { query: "睡眠问题", mustInclude: [1] },
  { query: "胃口", mustInclude: [2] },
  // 读书会
  { query: "读书会聊过什么", mustInclude: [3] },
  { query: "下次读书会要做什么", mustInclude: [4] },
  // 吉他
  { query: "我练琴怎么样", mustInclude: [5] },
  { query: "吉他课在哪天", mustInclude: [6] },
  // 人情
  { query: "和谁喝茶来着", mustInclude: [7] },
  { query: "邻居最近送过什么", mustInclude: [8] },
  // 家庭
  { query: "孙子的事", mustInclude: [9, 10] },
  { query: "儿子最近要来吗", mustInclude: [10] },
  // 综合 / 跨类
  { query: "今天天气", mustInclude: [11] },
  { query: "我看过什么文章", mustInclude: [12] },
  { query: "学到啥", mustInclude: [5] },     // 学习相关，应该命中吉他练习
  { query: "买东西的事", mustInclude: [9] }, // 购物
];

function pass(s) { console.log(`\x1b[32m  PASS ${s}\x1b[0m`); }
function fail(s) { console.log(`\x1b[31m  FAIL ${s}\x1b[0m`); }
function info(s) { console.log(`  · ${s}`); }

const results = { passed: 0, failed: 0, failures: [] };

console.log("\n===========================================");
console.log("  妈妈的备忘录 · 在线测试 harness v2");
console.log("===========================================\n");

console.log("【Phase 1】写入 seed 数据 (DeepSeek 分类)\n");
const seedIds = [];
const seedMeta = [];
for (let i = 0; i < SEEDS.length; i++) {
  const text = SEEDS[i];
  process.stdout.write(`  [${String(i).padStart(2," ")}] "${text.slice(0, 28)}..." `);
  try {
    const cls = await classifyAndExtract(text, env);
    const inserted = await db.insertFromClassification(text, cls, env);
    for (const row of inserted) seedIds.push(row.id);
    seedMeta.push({ idx: i, ids: inserted.map(r => r.id), text, classification: cls });
    process.stdout.write(`-> type=${cls.type} topic=${cls.topic} tags=${JSON.stringify(cls.tags)}\n`);
  } catch (e) {
    process.stdout.write(`\x1b[31m失败: ${e.message}\x1b[0m\n`);
    results.failed++;
    results.failures.push({ phase: "seed", idx: i, error: e.message });
  }
  await new Promise(r => setTimeout(r, 1100));
}

console.log(`\n  写入完成：${seedIds.length} 条 entries\n`);

console.log("【Phase 2】跑检索断言\n");

async function runQuery(query) {
  const intent = await parseQueryIntent(query, env);
  const fromDate = new Date(Date.now() - intent.fromDays * 24 * 3600 * 1000).toISOString();
  const [byKw, byTag, byTopic] = await Promise.all([
    db.searchByKeywords(intent.keywords, { fromDate }, env),
    db.searchByTags(intent.tags, { fromDate }, env),
    db.searchByTopics(intent.topics, { fromDate }, env),
  ]);
  const merged = new Map();
  for (const r of byKw) merged.set(r.id, r);
  for (const r of byTag) merged.set(r.id, r);
  for (const r of byTopic) merged.set(r.id, r);
  return { intent, results: Array.from(merged.values()) };
}

function seedIdxOf(entryId) {
  for (const sm of seedMeta) if (sm.ids.includes(entryId)) return sm.idx;
  return -1;
}

for (const c of CASES) {
  console.log(`  [Q] "${c.query}"`);
  let intent, recalledIdxs;
  try {
    const { intent: i2, results: rs } = await runQuery(c.query);
    intent = i2;
    recalledIdxs = new Set(rs.map(r => seedIdxOf(r.id)).filter(x => x >= 0));
  } catch (e) {
    fail(`查询失败: ${e.message}`);
    results.failed++;
    results.failures.push({ phase: "query", query: c.query, error: e.message });
    continue;
  }
  info(`intent: kw=${JSON.stringify(intent.keywords)} tags=${JSON.stringify(intent.tags)} topics=${JSON.stringify(intent.topics)}`);
  info(`召回 seed indexes: ${JSON.stringify(Array.from(recalledIdxs).sort((a,b)=>a-b))}`);
  for (const must of c.mustInclude) {
    if (recalledIdxs.has(must)) {
      pass(`必须召回 [${must}] "${SEEDS[must].slice(0,20)}..."`);
      results.passed++;
    } else {
      fail(`必须召回 [${must}] "${SEEDS[must].slice(0,20)}..." 但没召回`);
      results.failed++;
      results.failures.push({ phase: "query", query: c.query, missing: must, seed: SEEDS[must] });
    }
  }
  console.log("");
  await new Promise(r => setTimeout(r, 1100));
}

console.log("\n【Phase 3】清理 seed 数据");
const sb = db.getClient(env);
const { error: delErr } = await sb.from("entries").delete().in("id", seedIds);
if (delErr) {
  fail(`清理失败: ${delErr.message}`);
} else {
  pass(`已清理 ${seedIds.length} 条 seed`);
}

console.log("\n===========================================");
console.log(`  通过: \x1b[32m${results.passed}\x1b[0m   失败: \x1b[31m${results.failed}\x1b[0m`);
console.log("===========================================\n");
if (results.failed > 0) {
  console.log("失败明细：");
  for (const f of results.failures) console.log("  -", JSON.stringify(f));
  process.exit(1);
}
