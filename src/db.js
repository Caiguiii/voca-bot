// Cloudflare D1 資料存取

// ---------- users ----------
export async function ensureUser(DB, userId) {
  await DB.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)').bind(userId).run();
  return DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();
}

export function setPush(DB, userId, on) {
  return DB.prepare('UPDATE users SET push_enabled = ? WHERE user_id = ?').bind(on ? 1 : 0, userId).run();
}

export async function getUsersToPush(DB, today, force = false) {
  const stmt = force
    ? DB.prepare('SELECT * FROM users WHERE push_enabled = 1')
    : DB.prepare(
        'SELECT * FROM users WHERE push_enabled = 1 AND (last_push_date IS NULL OR last_push_date <> ?)',
      ).bind(today);
  const { results } = await stmt.all();
  return results;
}

export async function countPushUsers(DB) {
  const r = await DB.prepare('SELECT COUNT(*) AS n FROM users WHERE push_enabled = 1').first();
  return r?.n ?? 0;
}

/** 搶下「今天的推播」，避免 GitHub 與 Cloudflare 兩個排程重複送。回傳 true 代表可以送。 */
export async function claimToday(DB, userId, today, force = false) {
  if (force) return true;
  const r = await DB.prepare(
    'UPDATE users SET last_push_date = ? WHERE user_id = ? AND (last_push_date IS NULL OR last_push_date <> ?)',
  ).bind(today, userId, today).run();
  return r.meta.changes === 1;
}

/** 送出失敗時把日期還原，讓下一個排程可以補送 */
export function releaseToday(DB, userId, prevDate) {
  return DB.prepare('UPDATE users SET last_push_date = ? WHERE user_id = ?').bind(prevDate ?? null, userId).run();
}

/** 記錄已送出的單字並更新進度 */
export function markLearned(DB, userId, words, today, newProgress) {
  const stmts = words.map((w) =>
    DB.prepare('INSERT OR IGNORE INTO learned (user_id, word_id, learned_on) VALUES (?, ?, ?)').bind(userId, w.id, today),
  );
  stmts.push(
    DB.prepare('UPDATE users SET progress = ?, last_push_date = ? WHERE user_id = ?').bind(newProgress, today, userId),
  );
  return DB.batch(stmts);
}

// ---------- learned ----------
export async function getLearnedOn(DB, userId, date) {
  const { results } = await DB.prepare(
    'SELECT word_id FROM learned WHERE user_id = ? AND learned_on = ? ORDER BY word_id',
  ).bind(userId, date).all();
  return results.map((r) => r.word_id);
}

export async function isLearned(DB, userId, wordId) {
  const r = await DB.prepare('SELECT 1 FROM learned WHERE user_id = ? AND word_id = ?').bind(userId, wordId).first();
  return !!r;
}

export async function getLearnedIds(DB, userId) {
  const { results } = await DB.prepare('SELECT word_id FROM learned WHERE user_id = ?').bind(userId).all();
  return results.map((r) => r.word_id);
}

export async function listLearned(DB, userId, limit, offset) {
  const { results } = await DB.prepare(
    'SELECT word_id, learned_on FROM learned WHERE user_id = ? ORDER BY learned_on DESC, word_id ASC LIMIT ? OFFSET ?',
  ).bind(userId, limit, offset).all();
  return results;
}

export async function countLearned(DB, userId) {
  const r = await DB.prepare('SELECT COUNT(*) AS n FROM learned WHERE user_id = ?').bind(userId).first();
  return r?.n ?? 0;
}

// ---------- favorites ----------
export function addFavorite(DB, userId, wordId) {
  return DB.prepare('INSERT OR IGNORE INTO favorites (user_id, word_id) VALUES (?, ?)').bind(userId, wordId).run();
}

export async function removeFavorite(DB, userId, wordId) {
  const r = await DB.prepare('DELETE FROM favorites WHERE user_id = ? AND word_id = ?').bind(userId, wordId).run();
  return r.meta.changes > 0;
}

export async function isFavorite(DB, userId, wordId) {
  const r = await DB.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND word_id = ?').bind(userId, wordId).first();
  return !!r;
}

export async function getFavoriteIds(DB, userId) {
  const { results } = await DB.prepare('SELECT word_id FROM favorites WHERE user_id = ?').bind(userId).all();
  return results.map((r) => r.word_id);
}

export async function listFavorites(DB, userId, limit, offset) {
  const { results } = await DB.prepare(
    'SELECT word_id, wrong_count FROM favorites WHERE user_id = ? ORDER BY created_at DESC, word_id DESC LIMIT ? OFFSET ?',
  ).bind(userId, limit, offset).all();
  return results;
}

export async function countFavorites(DB, userId) {
  const r = await DB.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?').bind(userId).first();
  return r?.n ?? 0;
}

/** 測驗答錯：自動加入收藏並累計答錯次數 */
export function recordWrong(DB, userId, wordId) {
  return DB.prepare(
    `INSERT INTO favorites (user_id, word_id, wrong_count) VALUES (?, ?, 1)
     ON CONFLICT(user_id, word_id) DO UPDATE SET wrong_count = wrong_count + 1`,
  ).bind(userId, wordId).run();
}
