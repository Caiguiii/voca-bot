// 每日推播

import * as db from './db.js';
import { push, reply } from './line.js';
import { DAILY_COUNT, WORDS, wordsFrom } from './words.js';
import { textMsg, wordCarousel, withQuickReply } from './flex.js';

/** 台灣日期 YYYY-MM-DD */
export function taipeiDate(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 組出某位使用者「下一批」單字的訊息；沒有單字了回傳 null */
export function buildDailyMessages(user, greeting = '☀️ 早安！') {
  const words = wordsFrom(user.progress, DAILY_COUNT);
  if (!words.length) return null;
  const day = Math.floor(user.progress / DAILY_COUNT) + 1;
  // 只放「一個」訊息物件：5 張卡片在同一個 Carousel 裡（推播只算 1 則）
  // altText 會顯示在手機通知與聊天列表預覽
  const messages = [
    wordCarousel(words, {
      altText: `${greeting}Day ${day} 的 ${words.length} 個多益單字：${words.map((w) => w.word).join(', ')}`,
      labelFn: (_, i) => `📘 Day ${day} · ${i + 1}/${words.length}　👉 左右滑動`,
    }),
  ];
  return { words, messages };
}

export const finishedText = () => textMsg(`🎉 恭喜！你已經學完單字庫全部 ${WORDS.length} 個單字。新單字補充後會自動繼續推播。`);

/**
 * 送出今天的單字給一位使用者。
 * mode = 'push'（排程，計額度）或 'reply'（使用者主動要求，免費）
 * 回傳 'sent' | 'already' | 'finished'
 */
export async function deliverToday(env, user, { mode, replyToken, force = false, greeting, extra = [] }) {
  const today = taipeiDate();
  const built = buildDailyMessages(user, greeting);
  if (!built) return 'finished';

  const claimed = await db.claimToday(env.DB, user.user_id, today, force);
  if (!claimed) return 'already';

  try {
    const messages = [...extra, ...built.messages];
    if (mode === 'reply') {
      await reply(env, replyToken, withQuickReply(messages));
    } else {
      await push(env, user.user_id, messages);
    }
  } catch (err) {
    await db.releaseToday(env.DB, user.user_id, user.last_push_date);
    throw err;
  }
  await db.markLearned(env.DB, user.user_id, built.words, today, user.progress + built.words.length);
  return 'sent';
}

/** 排程觸發：推播給所有開啟推播的使用者 */
export async function runDaily(env, { force = false } = {}) {
  const today = taipeiDate();
  const users = await db.getUsersToPush(env.DB, today, force);
  const result = { date: today, users: users.length, sent: 0, already: 0, finished: 0, failed: 0 };

  for (const user of users) {
    try {
      const status = await deliverToday(env, user, { mode: 'push', force });
      result[status]++;
    } catch (err) {
      result.failed++;
      console.error('push failed', user.user_id, err.message);
    }
  }
  return result;
}
