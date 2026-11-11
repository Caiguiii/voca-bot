-- 每次部署都會執行，所以全部使用 IF NOT EXISTS（可重複執行）

CREATE TABLE IF NOT EXISTS users (
  user_id        TEXT PRIMARY KEY,           -- LINE userId
  progress       INTEGER NOT NULL DEFAULT 0, -- 已學到單字庫第幾個（陣列索引）
  push_enabled   INTEGER NOT NULL DEFAULT 1, -- 1 = 接收每日推播
  last_push_date TEXT,                       -- 最後一次送單字的日期（台灣時間 YYYY-MM-DD）
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS learned (
  user_id    TEXT NOT NULL,
  word_id    INTEGER NOT NULL,
  learned_on TEXT NOT NULL,                  -- YYYY-MM-DD
  PRIMARY KEY (user_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_learned_date ON learned (user_id, learned_on);

CREATE TABLE IF NOT EXISTS favorites (
  user_id     TEXT NOT NULL,
  word_id     INTEGER NOT NULL,
  wrong_count INTEGER NOT NULL DEFAULT 0,    -- 測驗答錯次數
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, word_id)
);
