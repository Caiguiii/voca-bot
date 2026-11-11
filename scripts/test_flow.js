// 端到端測試：用 Node 內建 SQLite 模擬 D1、攔截 LINE API，跑過所有主要功能。
// 用法：node scripts/test_flow.js
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

// ---- 模擬 D1 ----
function makeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => Promise.all(list.map((s) => s.run())),
    sqlite,
  };
}

// ---- 攔截 LINE API ----
const sent = [];
globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname;
  if (path.endsWith("/message/quota")) return Response.json({ type: "limited", value: 200 });
  if (path.endsWith("/message/quota/consumption")) return Response.json({ totalUsage: 31 });
  const body = JSON.parse(init.body);
  sent.push({ path: new URL(url).pathname, body });
  JSON.stringify(body).length; // 確認可序列化
  return new Response('{}', { status: 200 });
};

const env = {
  DB: makeD1(),
  LINE_CHANNEL_SECRET: 'test-secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
  CRON_SECRET: 'cron-secret',
};
const USER = 'U_test_user';

async function webhook(events, { badSig = false } = {}) {
  const body = JSON.stringify({ events });
  const sig = badSig ? 'nope' : createHmac('sha256', env.LINE_CHANNEL_SECRET).update(body).digest('base64');
  const waits = [];
  const res = await worker.fetch(
    new Request('https://x/webhook', { method: 'POST', body, headers: { 'x-line-signature': sig } }),
    env,
    { waitUntil: (p) => waits.push(p) },
  );
  await Promise.all(waits);
  return res;
}
const text = (t) => webhook([{ type: 'message', replyToken: 'r', source: { userId: USER }, message: { type: 'text', text: t } }]);
const postback = (data) => webhook([{ type: 'postback', replyToken: 'r', source: { userId: USER }, postback: { data } }]);
const last = () => sent[sent.length - 1];
const lastText = () => last().body.messages.map((m) => m.text || m.altText).join('\n');
const cron = (q = '') =>
  worker.fetch(new Request('https://x/cron/daily' + q, { method: 'POST', headers: { Authorization: 'Bearer cron-secret' } }), env, {});

let n = 0;
const ok = (name) => console.log(`  ✅ ${++n}. ${name}`);

// 1. 簽章錯誤要拒絕
assert.equal((await webhook([], { badSig: true })).status, 401);
ok('錯誤簽章被拒絕');

// 2. LINE Verify（空事件）
assert.equal((await webhook([])).status, 200);
ok('Webhook Verify 回 200');

// 3. 加好友 → 歡迎 + 今天 5 個字（reply）
await webhook([{ type: 'follow', replyToken: 'r', source: { userId: USER } }]);
assert.equal(last().path, '/v2/bot/message/reply');
assert.equal(last().body.messages.length, 2);
assert.equal(last().body.messages[1].contents.contents.length, 5);
ok('加好友收到歡迎訊息 + 5 張單字卡');

// 4. 同一天排程不重複推播
let r = await (await cron()).json();
assert.equal(r.sent, 0);
ok('今天已送過，排程不會重複推播');

// 5. 強制推播 → 第 2 天的字
r = await (await cron('?force=1')).json();
assert.equal(r.sent, 1);
assert.equal(last().path, '/v2/bot/message/push');
assert.equal(last().body.messages.length, 1, "推播只能有 1 個訊息物件");
assert.equal(last().body.messages[0].contents.type, "carousel");
assert.equal(last().body.messages[0].contents.contents.length, 5);
assert.match(last().body.messages[0].altText, /Day 2/);
ok('強制推播：1 個訊息物件內含 5 張卡片（Day 2）');

// 6. 未授權觸發
assert.equal((await worker.fetch(new Request('https://x/cron/daily', { method: 'POST' }), env, {})).status, 401);
ok('沒有 CRON_SECRET 不能觸發推播');

// 7. 今日
await text('今日');
assert.equal(last().body.messages[0].type, 'flex');
ok('「今日」顯示今天的單字卡');

// 8. 收藏（按鈕）
await postback('action=fav&id=1');
assert.match(lastText(), /已收藏「accommodate」/);
await text('收藏 audit');
assert.match(lastText(), /已收藏「audit」/);
await text('收藏 streamline');
assert.match(lastText(), /還沒學到/);
ok('按鈕收藏、打字收藏、未學過不能收藏');

// 9. 收藏清單
await text('收藏');
assert.match(lastText(), /共 2 個/);
ok('「收藏」列出清單');

// 10. 查詢
await text('查 audit');
assert.equal(last().body.messages[0].contents.footer.contents[0].action.data, 'action=unfav&id=7');
await text('ACCOMMODATE');
assert.equal(last().body.messages[0].type, 'flex');
await text('streamline');
assert.match(lastText(), /還沒學到/);
await text('查 收購');
assert.match(lastText(), /acquisition/);
await text('qwertyz');
assert.match(lastText(), /沒有「qwertyz」/);
ok('英文查詢、直接輸入、未學過、中文查詢、查無此字');

// 11. 已學
await text('已學');
assert.match(lastText(), /共 10 個/);
ok('「已學」列出 10 個單字');

// 12. 移除收藏
await text('移除 audit');
assert.match(lastText(), /已把「audit」移出收藏/);
await postback('action=unfav&id=1');
await text('收藏');
assert.match(lastText(), /收藏是空的/);
ok('打字移除、按鈕取消收藏');

// 13. 測驗：答錯自動收藏、答對
await text('測驗');
const quizMsg = last().body.messages[0];
const buttons = quizMsg.contents.footer.contents.map((b) => new URLSearchParams(b.action.data));
assert.equal(buttons.length, 4);
const targetId = buttons[0].get('id');
const wrong = buttons.find((b) => b.get('pick') !== targetId);
const right = buttons.find((b) => b.get('pick') === targetId);
await postback(wrong.toString());
assert.match(lastText(), /答錯了/);
await text('收藏');
assert.match(lastText(), /共 1 個/);
await postback(right.toString());
assert.match(lastText(), /答對了/);
ok('測驗出 4 個選項，答錯自動收藏，答對有回饋');

// 14. 複習收藏
await text('複習收藏');
assert.equal(last().body.messages[1].type, 'flex');
ok('「複習收藏」顯示卡片');

// 14b. 額度
await text("額度");
assert.match(lastText(), /已用 31 \/ 200 則/);
ok("「額度」顯示本月推播用量");

// 15. 停止 / 開始推播
await text('停止推播');
r = await (await cron('?force=1')).json();
assert.equal(r.users, 0);
await text('開始推播');
r = await (await cron('?force=1')).json();
assert.equal(r.users, 1);
ok('停止推播後排程不會送，開始推播後恢復');

// 16. 封鎖 → 停止推播
await webhook([{ type: 'unfollow', source: { userId: USER } }]);
r = await (await cron('?force=1')).json();
assert.equal(r.users, 0);
ok('封鎖 Bot 後自動停止推播');

// 17. 訊息大小檢查（LINE 限制 Flex 50KB）
for (const s of sent) {
  for (const m of s.body.messages) {
    if (m.type === 'flex') assert.ok(JSON.stringify(m.contents).length < 50000, 'flex too large');
    if (m.type === 'text') assert.ok(m.text.length <= 5000);
    if (m.altText) assert.ok(m.altText.length <= 400);
  }
  assert.ok(s.body.messages.length <= 5);
}
ok(`全部 ${sent.length} 次 LINE 呼叫都符合訊息大小限制`);

console.log('\n🎉 全部測試通過');
