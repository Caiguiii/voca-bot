# LINE 英文單字學習系統 — 實作計畫

> 目標：一個可以互動的 LINE 單字學習 Bot，而不只是定時推播。
> 原則：全部使用免費服務、不使用付費 AI API、不需要自己的電腦開機。

---

## 1. 功能需求

| # | 功能 | 說明 |
|---|------|------|
| F1 | 每日推播 | 每天早上 10:00（台灣時間）自動傳送 **5 個新單字** |
| F2 | 單字內容 | 每個單字包含：音標、詞性、中文意思、**相關片語**、**例句（中英）**、**相似詞**、**相反詞** |
| F3 | 收藏 | 每個單字卡片上有「⭐ 收藏」按鈕，一按就存進「不熟單字本」 |
| F4 | 查詢 | 輸入單字可查詢已學過的單字；可列出學習歷史、收藏清單 |
| F5 | 免開機 | 程式跑在雲端，由 GitHub 管理程式碼與排程 |
| F6 | 免費 | 不使用 OpenAI / Claude 等付費 API，單字內容事先整理成靜態資料 |
| F7（加分） | 複習測驗 | 從收藏 / 已學單字出選擇題，答對答錯有回饋 |

---

## 2. 為什麼不能「只用 GitHub」？

- **每日推播**：GitHub Actions 的排程（cron）就能做到 ✅
- **收藏、查詢**：使用者在 LINE 按按鈕或打字時，LINE 會把事件即時送到一個 **Webhook 網址**。
  GitHub Actions **無法接收即時請求** ❌，所以需要一個 24 小時在線的免費伺服器。

**解法：GitHub + Cloudflare Workers（免費）**

```
             ┌──────────────────────── GitHub ────────────────────────┐
             │  程式碼 + 單字資料 (words.json)                          │
             │  GitHub Actions：                                       │
             │   ① push 到 main → 自動部署到 Cloudflare                 │
             │   ② 每天 02:00 UTC (= 台灣 10:00) → 觸發每日推播          │
             └───────────────┬────────────────────────────────────────┘
                             │ 部署 / 呼叫 /cron/daily
                             ▼
┌────────────┐  Webhook  ┌──────────────────────────┐   SQL   ┌──────────────┐
│ LINE 使用者 │ ────────▶ │ Cloudflare Worker (24h)  │ ──────▶ │ Cloudflare D1│
│ (手機)      │ ◀──────── │ 處理收藏/查詢/推播        │ ◀────── │ (SQLite 資料庫)│
└────────────┘ Reply/Push └──────────────────────────┘         └──────────────┘
```

---

## 3. 使用的免費服務與額度

| 服務 | 用途 | 免費額度 | 是否夠用 |
|------|------|----------|----------|
| **LINE Messaging API** | 傳訊息 | 推播 (Push) 每月 200 則；**回覆 (Reply) 不限次數** | 每日推播 1 則/人 × 30 天 = 30 則，約可支援 6 人；查詢、收藏用 Reply 不計費 |
| **Cloudflare Workers** | Webhook 伺服器 | 每天 100,000 次請求 | 綽綽有餘 |
| **Cloudflare D1** | 存使用者、收藏、學習紀錄 | 5 GB、每天 500 萬次讀取 | 綽綽有餘 |
| **GitHub** | 程式碼、單字資料、Actions 排程與自動部署 | Public repo 免費無限；Private repo 每月 2,000 分鐘 | 每天跑 1 次約 1 分鐘，夠用 |
| **ECDICT** (開源字典, MIT) | 音標、中文意思 | 免費、離線 | 用來產生單字資料 |
| **Free Dictionary API / Datamuse** | 例句、相似詞、相反詞 | 免費、免金鑰 | 只在「產生資料」時呼叫，Bot 執行時不呼叫 |

> 💡 **重點：** 一則 Flex Carousel（5 張單字卡）只算 **1 則訊息**，所以每天 5 個單字只花 1 則額度。

---

## 4. 單字內容從哪來？（不用付費 AI）

單字內容**事先產生好**，存成 `data/words.json` 放在 GitHub。Bot 執行時只讀資料，不呼叫任何 AI。

### 產生方式（擇一或混用）

1. **方案 A（推薦）：由 Claude Code 在開發階段直接寫好資料**
   - 你在這個對話裡請我產生例如「學測 7000 單字 Level 3–4，前 300 個」，我直接寫成 JSON。
   - 這是開發時一次性產生，**不是程式執行時呼叫 API**，所以不會產生任何費用。
   - 品質最好（片語、例句、中文翻譯都較自然）。

2. **方案 B：用免費開源資料自動組合**（`scripts/build_words.py`）
   - 單字清單：學測 / 多益 / GRE 等公開字表
   - 音標、中文：ECDICT（簡體 → 用 OpenCC 轉繁體）
   - 例句、相似詞、相反詞：Free Dictionary API、Datamuse API (`rel_syn`, `rel_ant`)
   - 缺點：片語和中文例句翻譯常缺漏，需要人工補。

### 單字資料格式 `data/words.json`

```json
[
  {
    "id": 1,
    "word": "abandon",
    "level": 4,
    "phonetic": "/əˈbændən/",
    "pos": "v.",
    "meaning": "放棄；拋棄",
    "phrases": [
      { "en": "abandon oneself to", "zh": "沉溺於" },
      { "en": "abandon ship", "zh": "棄船；放棄計畫" }
    ],
    "examples": [
      { "en": "They had to abandon the car in the snow.", "zh": "他們不得不把車丟在雪地裡。" }
    ],
    "synonyms": ["desert", "give up", "quit"],
    "antonyms": ["keep", "maintain", "continue"]
  }
]
```

---

## 5. LINE 上的使用體驗

### 5.1 每日推播（10:00）

一則 **Flex Carousel**，左右滑動 5 張卡片：

```
┌─────────────────────────────┐
│ 📘 Day 12 · 1/5              │
│ abandon  /əˈbændən/   v.     │
│ 放棄；拋棄                    │
│─────────────────────────────│
│ 🔗 片語                       │
│ • abandon oneself to 沉溺於   │
│ 📝 例句                       │
│ They had to abandon the car..│
│ 他們不得不把車丟在雪地裡。      │
│ ≈ 相似：desert, give up       │
│ ≠ 相反：keep, maintain        │
│─────────────────────────────│
│ [ ⭐ 收藏 ]   [ 🔊 發音 ]      │
└─────────────────────────────┘
```

- **⭐ 收藏**：Postback 按鈕，按下後 Bot 回覆「已收藏 abandon ✅」
- **🔊 發音**：開啟 Cambridge / Google 發音頁面（免費，不用自己做語音）

### 5.2 指令（打字輸入）

| 輸入 | 動作 |
|------|------|
| `今日` / `today` | 重新顯示今天的 5 個單字 |
| `收藏` | 列出我的收藏單字 |
| `查 abandon` 或直接輸入 `abandon` | 查詢該單字完整卡片（只限已學過的；未學過會提示） |
| `已學` / `歷史` | 列出已學過的單字（依日期分組，分頁） |
| `移除 abandon` | 從收藏移除 |
| `測驗` | 從收藏/已學單字出一題四選一（加分功能） |
| `說明` / `help` | 顯示指令說明 |

### 5.3 圖文選單（Rich Menu）

手機下方固定 6 格按鈕，不用打字：

```
┌──────────┬──────────┬──────────┐
│ 📘 今日單字 │ ⭐ 我的收藏 │ 📚 已學單字 │
├──────────┼──────────┼──────────┤
│ 🔍 查詢    │ 📝 測驗    │ ❓ 說明    │
└──────────┴──────────┴──────────┘
```

---

## 6. 資料庫設計（Cloudflare D1）

```sql
-- 使用者（加好友時自動建立）
CREATE TABLE users (
  user_id      TEXT PRIMARY KEY,      -- LINE userId
  progress     INTEGER DEFAULT 0,     -- 已推播到 words.json 第幾個
  push_enabled INTEGER DEFAULT 1,     -- 1=接收每日推播
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 學習紀錄（每日推播的單字）
CREATE TABLE learned (
  user_id    TEXT,
  word_id    INTEGER,
  learned_on TEXT,                    -- 2026-11-10
  PRIMARY KEY (user_id, word_id)
);

-- 收藏（不熟的單字）
CREATE TABLE favorites (
  user_id    TEXT,
  word_id    INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  wrong_count INTEGER DEFAULT 0,      -- 測驗答錯次數（加分功能）
  PRIMARY KEY (user_id, word_id)
);
```

單字內容本身**不放資料庫**，而是部署時把 `words.json` 打包進 Worker，讀取最快、最省額度。

---

## 7. 專案結構

```
voca/
├── PLAN.md                     ← 本文件
├── README.md                   ← 安裝教學
├── package.json
├── wrangler.toml               ← Cloudflare Worker 設定
├── schema.sql                  ← D1 資料表
├── data/
│   └── words.json              ← 單字資料
├── src/
│   ├── index.js                ← 進入點：路由 /webhook、/cron/daily
│   ├── line.js                 ← LINE API：簽章驗證、reply、push
│   ├── handlers.js             ← 指令處理：收藏、查詢、歷史、測驗
│   ├── daily.js                ← 每日推播邏輯
│   ├── db.js                   ← D1 存取
│   └── flex.js                 ← Flex Message 卡片樣板
├── scripts/
│   ├── build_words.py          ← （方案 B）用開源資料產生 words.json
│   ├── validate_words.js       ← 檢查 words.json 格式、有無重複
│   └── test_flow.js            ← 端到端測試（模擬 D1 與 LINE）
└── .github/workflows/
    ├── deploy.yml              ← push 到 main → 部署 Worker
    └── daily.yml               ← 每天 00:00 UTC 觸發推播
```

技術選擇：**JavaScript（Cloudflare Workers 原生支援）**，不需安裝額外框架。

---

## 8. 核心流程

### 8.1 每日推播

```
GitHub Actions (cron: "0 0 * * *")
  └─ curl -X POST https://<worker>/cron/daily -H "Authorization: Bearer $CRON_SECRET"
       └─ Worker:
            for 每個 push_enabled=1 的使用者:
              words = words.json[progress : progress+5]
              push Flex Carousel
              寫入 learned；progress += 5
```

### 8.2 收藏（Postback）

```
使用者按 ⭐ → LINE 送 postback: "action=fav&id=1"
  └─ Worker 驗證簽章 → INSERT favorites → reply「已收藏 abandon ✅」
```

### 8.3 查詢

```
使用者輸入 "abandon"
  └─ 在 words.json 找到 → 檢查 learned 是否有 → reply 單字卡（附 ⭐ 按鈕）
     不在 learned → reply「這個字還沒學到喔，預計第 N 天會出現」
```

### 8.4 安全性

- Webhook 必須驗證 `x-line-signature`（HMAC-SHA256），防止偽造請求。
- `/cron/daily` 需帶 `CRON_SECRET`，防止別人亂觸發推播。
- 金鑰全部放在 **GitHub Secrets** 與 **Cloudflare Secrets**，不寫進程式碼。

---

## 9. 執行步驟（你要做的事）

### 步驟 1：申請 LINE Bot（約 10 分鐘）
1. 到 [LINE Developers](https://developers.line.biz/) 用 LINE 帳號登入
2. 建立 Provider → 建立 **Messaging API** Channel
3. 記下：
   - **Channel secret**（Basic settings 頁）
   - **Channel access token**（Messaging API 頁 → Issue）
4. 到 LINE Official Account Manager → 回應設定：
   - 關閉「自動回應訊息」、關閉「加入好友歡迎訊息」
   - 開啟「Webhook」
5. 用手機掃 QR Code 把 Bot 加為好友

### 步驟 2：申請 Cloudflare（約 5 分鐘）
1. 到 [cloudflare.com](https://dash.cloudflare.com/sign-up) 免費註冊（不用綁信用卡）
2. 記下 **Account ID**（Workers & Pages 頁右側）
3. 建立 **API Token**：My Profile → API Tokens → 使用「Edit Cloudflare Workers」範本，並加上 D1 Edit 權限

### 步驟 3：建立 GitHub Repo（約 5 分鐘）
1. 在 GitHub 建立新 repo（建議 **Public** → Actions 無限免費；金鑰放 Secrets 不會外洩）
2. Settings → Secrets and variables → Actions，新增：

| Secret 名稱 | 內容 |
|-------------|------|
| `CLOUDFLARE_API_TOKEN` | 步驟 2 的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | 步驟 2 的 Account ID |
| `LINE_CHANNEL_SECRET` | 步驟 1 的 Channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | 步驟 1 的 access token |
| `CRON_SECRET` | 自己隨便打一串長亂碼 |
| `WORKER_URL` | 第一次部署後取得，例如 `https://voca-bot.xxx.workers.dev` |

### 步驟 4–5：上傳程式碼並自動部署
已改為全自動：`git push` 後 GitHub Actions 會自動建立 D1 資料庫、資料表並部署，不需要 `wrangler login` 或手動貼 database_id。詳細步驟見 [README.md](README.md)。

### 步驟 6：設定 Webhook
1. 回到 LINE Developers → Messaging API → Webhook URL 填入 `https://<你的worker>/webhook`
2. 按 **Verify** 出現 Success
3. 開啟 **Use webhook**
4. 圖文選單：在 LINE Official Account Manager 後台建立（免寫程式）；每則回覆下方也有快速按鈕

### 步驟 7：測試
- 在 LINE 傳「說明」→ 應回覆指令列表
- 到 GitHub → Actions → `daily` → **Run workflow** 手動觸發 → 手機應收到 5 個單字
- 按 ⭐ 收藏 → 傳「收藏」→ 應看到該單字

---

## 10. 開發里程碑

| 階段 | 內容 | 完成標準 |
|------|------|----------|
| **M1 基礎** | Worker + Webhook + 簽章驗證 + 「說明」回覆 | LINE 傳訊息有回應 |
| **M2 資料** | `words.json`（先 300 字 = 60 天）+ 格式驗證腳本 | `validate_words.js` 通過 |
| **M3 推播** | D1 + `/cron/daily` + Flex 卡片 + GitHub Actions 排程 | 手動 Run workflow 收到 5 張卡 |
| **M4 收藏/查詢** | Postback 收藏、`收藏`、`查`、`已學`、`移除` | 第 9 節步驟 7 全部通過 |
| **M5 體驗** | Rich Menu、分頁、加好友自動註冊、封鎖時停推 | 不打字也能操作全部功能 |
| **M6 加分** | 測驗、答錯自動加入收藏、每週日推播「本週複習」 | 可連續作答 |

---

## 11. 注意事項與限制

1. **GitHub Actions 排程可能延遲 5–30 分鐘**（尖峰時段）。若需要準時，可改用 Cloudflare Worker 內建的 Cron Trigger（同樣免費，`wrangler.toml` 加一行），GitHub 只負責程式碼與部署。
2. **GitHub 規定：repo 超過 60 天沒有任何 commit，排程 workflow 會被自動停用。** 對策：
   - 定期新增單字（本來就會 commit），或
   - 改用 Cloudflare Cron Trigger（不受此限制）← 建議設為備援
3. **LINE 免費推播 200 則/月**：只有每日推播會用到 Push；收藏、查詢、測驗都是 Reply，不計額度。若使用者超過約 6 人，需改成「使用者傳『今日』才回覆」的模式（Reply 免費）。
4. **時區**：GitHub cron 使用 UTC，台灣 10:00 = `0 2 * * *`；台灣 21:00 = `0 13 * * *`。
5. **單字資料量**：每天 5 字，300 字可用 60 天、7000 字可用約 4 年。可分批補充。

---

## 12. 已確認的決定（2026-11-10）

| 項目 | 決定 |
|------|------|
| 推播時間 | 每天早上 **10:00**（GitHub Actions `0 2 * * *`），Cloudflare Cron 10:30 備援補送 |
| 單字範圍 | **多益金色證書（860+）** 商務單字 |
| 資料產生方式 | **方案 A**：由 Claude 直接撰寫，首批 100 字（20 天份），之後分批追加 |
| Cloudflare 費用 | 免費方案、不需信用卡；超量只會暫停，不會扣款 |
| 資料庫建立 | 由 GitHub Actions 自動建立 D1 並套用 schema，不需本機操作 |

## 13. 實作狀態

- ✅ M1–M4 完成：Webhook、簽章驗證、每日推播（防重複）、收藏、查詢（英/中）、已學歷史
- ✅ M5：快速回覆按鈕、加好友自動註冊並立即送當日單字、封鎖自動停推（圖文選單用 LINE 後台建立）
- ✅ M6：測驗（英翻中 / 中翻英），答錯自動收藏、複習收藏
- ✅ 端到端測試 `npm test` 17 項全部通過
- 👉 安裝步驟見 [README.md](README.md)
