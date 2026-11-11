// 單字庫：新增單字時，在 data/words/ 新增 batchXX.json，並在這裡 import 後加到 WORDS 最後面。
// ⚠️ 已上線的單字不要刪除或調整順序（使用者進度是用順序記錄的），只能往後加。
import batch01 from '../data/words/batch01.json' with { type: 'json' };
import batch02 from '../data/words/batch02.json' with { type: 'json' };

export const WORDS = [...batch01, ...batch02];

export const DAILY_COUNT = 5;

const byId = new Map(WORDS.map((w) => [w.id, w]));
const byWord = new Map(WORDS.map((w) => [w.word.toLowerCase(), w]));
const indexById = new Map(WORDS.map((w, i) => [w.id, i]));

export const getWord = (id) => byId.get(Number(id));
export const findWord = (q) => byWord.get(String(q).trim().toLowerCase());
export const wordIndex = (id) => indexById.get(Number(id));
export const wordsFrom = (start, n) => WORDS.slice(start, start + n);

/** 取第一個中文意思（給測驗按鈕用） */
export function shortMeaning(w) {
  return w.meaning.split(/[；;]/)[0].trim();
}
