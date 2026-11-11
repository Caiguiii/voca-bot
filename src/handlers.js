// 處理 LINE 事件：加好友、文字指令、按鈕（postback）

import * as db from './db.js';
import { getQuota, reply } from './line.js';
import { DAILY_COUNT, WORDS, findWord, getWord, shortMeaning, wordIndex } from './words.js';
import { quizBubble, textMsg, withQuickReply, wordCard, wordCarousel } from './flex.js';
import { deliverToday, finishedText, taipeiDate } from './daily.js';

const HELP = `📖 使用說明
每天早上 10:00 自動送上 5 個多益金色單字 ☀️

• 今日 — 今天的 5 個單字
• 收藏 — 我的收藏清單（不熟的字）
• 複習收藏 — 用卡片複習收藏的字
• 已學 — 學過的單字列表
• 查 audit — 查詢學過的單字（也可直接輸入英文）
• 查 預算 — 用中文找學過的單字
• 收藏 audit / 移除 audit — 加入 / 移出收藏
• 測驗 — 從學過的字出題，答錯自動收藏
• 額度 — 查看本月推播用量
• 停止推播 / 開始推播`;

const PAGE_FAV = 20;
const PAGE_HISTORY = 30;

const send = (env, token, messages) => reply(env, token, withQuickReply(messages));
const isEnglish = (s) => /^[a-z][a-z' -]*$/i.test(s);
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const listLine = (w, i) => `${i}. ${w.word}  ${w.meaning}`;

export async function handleEvent(event, env) {
  const userId = event.source?.userId;
  if (!userId) return;

  switch (event.type) {
    case 'follow':
      return onFollow(event, env, userId);
    case 'unfollow':
      return db.setPush(env.DB, userId, false);
    case 'message':
      if (event.message.type === 'text') return onText(event, env, userId);
      return send(env, event.replyToken, [textMsg('目前只看得懂文字喔 🙂 輸入「說明」看可以做什麼')]);
    case 'postback':
      return onPostback(event, env, userId);
    default:
      return;
  }
}

// ---------- 加好友 ----------
async function onFollow(event, env, userId) {
  const user = await db.ensureUser(env.DB, userId);
  await db.setPush(env.DB, userId, true);
  const welcome = textMsg(
    `👋 歡迎！我是你的多益金色單字小老師。\n每天早上 10:00 送你 5 個新單字，包含片語、例句、相似詞與相反詞。\n\n輸入「說明」可以看所有功能。`,
  );
  const status = await deliverToday(env, user, {
    mode: 'reply',
    replyToken: event.replyToken,
    greeting: '🎁 先送你今天的份：',
    extra: [welcome],
  });
  if (status !== 'sent') await send(env, event.replyToken, [welcome, textMsg(HELP)]);
}

// ---------- 文字指令 ----------
async function onText(event, env, userId) {
  const token = event.replyToken;
  const raw = event.message.text.trim();
  const user = await db.ensureUser(env.DB, userId);

  const [first, ...rest] = raw.split(/\s+/);
  const cmd = first.toLowerCase();
  const arg = rest.join(' ').trim();

  if (['說明', 'help', '?', '？', '指令', '功能'].includes(cmd)) return send(env, token, [textMsg(HELP)]);
  if (['今日', '今天', 'today'].includes(cmd)) return showToday(env, token, user);
  if (['收藏', '我的收藏', 'fav'].includes(cmd)) {
    if (arg && !/^\d+$/.test(arg)) return addFavByWord(env, token, userId, arg);
    return showFavorites(env, token, userId, parseInt(arg, 10) || 1);
  }
  if (['複習收藏', '複習'].includes(cmd)) return reviewFavorites(env, token, userId);
  if (['已學', '歷史', 'history'].includes(cmd)) return showHistory(env, token, userId, parseInt(arg, 10) || 1);
  if (['測驗', 'quiz', '下一題'].includes(cmd)) return quiz(env, token, userId);
  if (['移除', '取消收藏'].includes(cmd)) return removeFavByWord(env, token, userId, arg);
  if (['查', '查詢', 'search'].includes(cmd)) return lookup(env, token, user, arg);
  if (['額度', '用量', 'quota'].includes(cmd)) return showQuota(env, token);
  if (cmd === '停止推播') {
    await db.setPush(env.DB, userId, false);
    return send(env, token, [textMsg('🔕 已停止每日推播。想恢復請輸入「開始推播」。')]);
  }
  if (cmd === '開始推播') {
    await db.setPush(env.DB, userId, true);
    return send(env, token, [textMsg('🔔 已開啟每日推播，每天早上 10:00 見！')]);
  }

  // 沒有指令：直接當成查詢
  return lookup(env, token, user, raw, true);
}

async function showQuota(env, token) {
  const { limit, used } = await getQuota(env);
  const users = await db.countPushUsers(env.DB);
  const t = limit == null
    ? `📊 本月已推播 ${used} 則（無上限方案）`
    : `📊 本月推播額度：已用 ${used} / ${limit} 則（剩 ${limit - used} 則）\n` +
      `👥 目前 ${users} 人接收推播，每人每天 1 則，一個月約 ${users * 31} 則` +
      (users * 31 > limit ? '\n⚠️ 可能超過額度，建議部分人改用「今日」自己領（回覆不計額度）' : '\n✅ 額度足夠');
  return send(env, token, [textMsg(t + '\n\n💡 查詢、收藏、測驗等回覆訊息都不計入額度')]);
}

async function showToday(env, token, user, retried = false) {
  const today = taipeiDate();
  if (user.last_push_date === today) {
    const ids = await db.getLearnedOn(env.DB, user.user_id, today);
    if (ids.length) {
      const favSet = new Set(await db.getFavoriteIds(env.DB, user.user_id));
      const words = ids.map(getWord).filter(Boolean);
      return send(env, token, [
        wordCarousel(words, { altText: `今天的單字：${words.map((w) => w.word).join(', ')}`, labelFn: (_, i) => `📘 今日 ${i + 1}/${words.length}`, favSet }),
      ]);
    }
    if (retried) return send(env, token, [textMsg('📬 今天的單字正在送出中，請稍等一下再輸入「今日」')]);
  }
  // 今天還沒送（例如排程還沒跑）→ 直接用回覆送出（免費）
  const status = await deliverToday(env, user, { mode: 'reply', replyToken: token, greeting: '📬 ' });
  if (status === 'finished') return send(env, token, [finishedText()]);
  if (status === 'already') return showToday(env, token, { ...user, last_push_date: today }, true);
}

async function showFavorites(env, token, userId, page) {
  const total = await db.countFavorites(env.DB, userId);
  if (!total) return send(env, token, [textMsg('⭐ 收藏是空的。\n在單字卡上按「⭐ 收藏」，或輸入「收藏 單字」就能加入。')]);
  const pages = Math.ceil(total / PAGE_FAV);
  page = Math.min(Math.max(page, 1), pages);
  const rows = await db.listFavorites(env.DB, userId, PAGE_FAV, (page - 1) * PAGE_FAV);
  const lines = rows
    .map((r, i) => {
      const w = getWord(r.word_id);
      if (!w) return null;
      return listLine(w, (page - 1) * PAGE_FAV + i + 1) + (r.wrong_count ? `  ❌${r.wrong_count}` : '');
    })
    .filter(Boolean);
  let t = `⭐ 我的收藏（共 ${total} 個，第 ${page}/${pages} 頁）\n\n${lines.join('\n')}\n\n💡 輸入「查 單字」看完整卡片、「複習收藏」用卡片複習`;
  if (page < pages) t += `\n➡️ 下一頁：輸入「收藏 ${page + 1}」`;
  return send(env, token, [textMsg(t)]);
}

async function reviewFavorites(env, token, userId) {
  const ids = await db.getFavoriteIds(env.DB, userId);
  if (!ids.length) return send(env, token, [textMsg('⭐ 收藏是空的，先收藏幾個不熟的單字吧！')]);
  const words = shuffle(ids).slice(0, 10).map(getWord).filter(Boolean);
  const favSet = new Set(ids);
  return send(env, token, [
    textMsg(`🔁 隨機複習 ${words.length} 個收藏單字（共 ${ids.length} 個）\n記住了就按「取消收藏」`),
    wordCarousel(words, { altText: '複習收藏', labelFn: (_, i) => `🔁 複習 ${i + 1}/${words.length}`, favSet }),
  ]);
}

async function showHistory(env, token, userId, page) {
  const total = await db.countLearned(env.DB, userId);
  if (!total) return send(env, token, [textMsg('📚 還沒有學過的單字，輸入「今日」開始吧！')]);
  const pages = Math.ceil(total / PAGE_HISTORY);
  page = Math.min(Math.max(page, 1), pages);
  const rows = await db.listLearned(env.DB, userId, PAGE_HISTORY, (page - 1) * PAGE_HISTORY);
  const groups = new Map();
  for (const r of rows) {
    const w = getWord(r.word_id);
    if (!w) continue;
    if (!groups.has(r.learned_on)) groups.set(r.learned_on, []);
    groups.get(r.learned_on).push(`  ${w.word}  ${shortMeaning(w)}`);
  }
  const body = [...groups].map(([date, ls]) => `📅 ${date}\n${ls.join('\n')}`).join('\n\n');
  let t = `📚 已學單字（共 ${total} 個，第 ${page}/${pages} 頁）\n\n${body}\n\n💡 輸入「查 單字」看完整卡片`;
  if (page < pages) t += `\n➡️ 下一頁：輸入「已學 ${page + 1}」`;
  return send(env, token, [textMsg(t)]);
}

async function lookup(env, token, user, q, implicit = false) {
  q = (q || '').trim();
  if (!q) return send(env, token, [textMsg('請輸入要查的單字，例如：「查 audit」或「查 預算」')]);
  const userId = user.user_id;

  if (isEnglish(q)) {
    const w = findWord(q);
    if (!w) return send(env, token, [textMsg(`🔍 單字庫裡沒有「${q}」。\n（只收錄多益金色單字；輸入「說明」看指令）`)]);
    if (!(await db.isLearned(env.DB, userId, w.id))) {
      const daysLeft = Math.floor(wordIndex(w.id) / DAILY_COUNT) - Math.floor(user.progress / DAILY_COUNT) + 1;
      return send(env, token, [textMsg(`🔒「${w.word}」還沒學到喔，大約再 ${daysLeft} 天會出現 📅\n先別偷看，專心學今天的字吧！`)]);
    }
    const fav = await db.isFavorite(env.DB, userId, w.id);
    return send(env, token, [wordCard(w, { label: '🔍 查詢結果', fav })]);
  }

  // 中文：在已學單字的中文意思裡找
  const learned = new Set(await db.getLearnedIds(env.DB, userId));
  const hits = WORDS.filter((w) => learned.has(w.id) && w.meaning.includes(q));
  if (!hits.length) {
    if (implicit) return send(env, token, [textMsg(`🤔 看不懂「${q.slice(0, 20)}」\n輸入「說明」看所有指令`)]);
    return send(env, token, [textMsg(`🔍 已學單字中，沒有意思包含「${q}」的字。`)]);
  }
  const favSet = new Set(await db.getFavoriteIds(env.DB, userId));
  if (hits.length === 1) return send(env, token, [wordCard(hits[0], { label: '🔍 查詢結果', fav: favSet.has(hits[0].id) })]);
  return send(env, token, [
    textMsg(`🔍 找到 ${hits.length} 個意思包含「${q}」的字${hits.length > 10 ? '（顯示前 10 個）' : ''}`),
    wordCarousel(hits.slice(0, 10), { altText: `查詢：${q}`, labelFn: (_, i) => `🔍 ${i + 1}/${Math.min(hits.length, 10)}`, favSet }),
  ]);
}

async function addFavByWord(env, token, userId, q) {
  const w = findWord(q);
  if (!w) return send(env, token, [textMsg(`單字庫裡沒有「${q}」`)]);
  if (!(await db.isLearned(env.DB, userId, w.id))) return send(env, token, [textMsg(`「${w.word}」還沒學到，學到後再收藏吧！`)]);
  return addFav(env, token, userId, w);
}

async function addFav(env, token, userId, w) {
  await db.addFavorite(env.DB, userId, w.id);
  const n = await db.countFavorites(env.DB, userId);
  return send(env, token, [textMsg(`⭐ 已收藏「${w.word}」${w.meaning}\n目前共 ${n} 個收藏`)]);
}

async function removeFavByWord(env, token, userId, q) {
  if (!q) return send(env, token, [textMsg('請輸入要移除的單字，例如：「移除 audit」')]);
  const w = findWord(q);
  if (!w) return send(env, token, [textMsg(`單字庫裡沒有「${q}」`)]);
  const removed = await db.removeFavorite(env.DB, userId, w.id);
  return send(env, token, [textMsg(removed ? `🗑️ 已把「${w.word}」移出收藏` : `「${w.word}」不在收藏裡`)]);
}

// ---------- 測驗 ----------
async function quiz(env, token, userId) {
  const learned = await db.getLearnedIds(env.DB, userId);
  if (!learned.length) return send(env, token, [textMsg('📝 還沒有學過的單字，先輸入「今日」學幾個吧！')]);
  const favs = await db.getFavoriteIds(env.DB, userId);
  // 有收藏時，六成機率從收藏出題
  const pool = favs.length && Math.random() < 0.6 ? favs : learned;
  const target = getWord(pool[Math.floor(Math.random() * pool.length)]);
  if (!target) return send(env, token, [textMsg('出題失敗，請再試一次')]);

  const targetMeaning = shortMeaning(target);
  const distractors = shuffle(WORDS.filter((w) => w.id !== target.id && shortMeaning(w) !== targetMeaning)).slice(0, 3);
  const reverse = Math.random() < 0.5; // 一半題目「中翻英」
  const choices = shuffle([target, ...distractors]).map((w) => ({ id: w.id, label: reverse ? w.word : shortMeaning(w) }));
  const question = reverse ? `「${targetMeaning}」的英文是？` : `${target.word} 的意思是？`;
  return send(env, token, [quizBubble(question, choices, target.id)]);
}

// ---------- 按鈕 ----------
async function onPostback(event, env, userId) {
  const token = event.replyToken;
  const p = new URLSearchParams(event.postback.data);
  const action = p.get('action');
  const w = getWord(p.get('id'));
  if (!w) return send(env, token, [textMsg('找不到這個單字')]);
  await db.ensureUser(env.DB, userId);

  if (action === 'fav') return addFav(env, token, userId, w);

  if (action === 'unfav') {
    await db.removeFavorite(env.DB, userId, w.id);
    return send(env, token, [textMsg(`👍 已把「${w.word}」移出收藏，記住了！`)]);
  }

  if (action === 'ans') {
    const pick = Number(p.get('pick'));
    if (pick === w.id) {
      return send(env, token, [textMsg(`✅ 答對了！\n${w.word} = ${w.meaning}\n\n按下方「📝 測驗」繼續下一題 👇`)]);
    }
    await db.recordWrong(env.DB, userId, w.id);
    return send(env, token, [
      textMsg(`❌ 答錯了！正確答案：\n${w.word} = ${w.meaning}\n已自動加入收藏 ⭐（按下方「📝 測驗」繼續）`),
      wordCard(w, { label: '📖 再看一次', fav: true }),
    ]);
  }
}
