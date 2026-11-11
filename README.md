# 📘 LINE 多益金色單字 Bot

每天早上 **10:00** 自動送 5 個多益金色證書（860+）單字到 LINE，每個單字都有片語、例句、相似詞和相反詞。
你可以收藏、查詢、看學習歷史、做測驗，全部用免費服務，電腦不用開著。

- 程式碼放 GitHub，每次 push 自動部署
- 執行環境是 Cloudflare Workers + D1 資料庫（免費方案、不用綁信用卡）
- 排程主力是 GitHub Actions 10:00，Cloudflare 10:30 備援補送，不會重複送

---

## 一次性設定（約 30 分鐘，全部在網頁上操作）

### 1️⃣ 建立 LINE Bot
1. 登入 <https://developers.line.biz/console/>，建立 Provider，再建立 **Messaging API** channel
   （如果系統要你先到 LINE Official Account Manager 建立官方帳號，照著做就好）
2. 抄下兩個值：
   - **Basic settings** 頁的 `Channel secret`
   - **Messaging API** 頁最下方 `Channel access token (long-lived)`，按 **Issue** 產生
3. 到 [LINE Official Account Manager](https://manager.line.biz/) → 設定 → **回應設定**：
   - 「自動回應訊息」選**關閉**
   - 「加入好友的歡迎訊息」選**關閉**（Bot 會自己送歡迎訊息）
   - 「Webhook」選**開啟**

### 2️⃣ 建立 Cloudflare 帳號
1. 到 <https://dash.cloudflare.com/sign-up> 免費註冊
2. 左側點 **Workers & Pages** 打開一次（系統會幫你建立 `xxx.workers.dev` 網域）
3. 抄下右側的 **Account ID**
4. 右上角頭像 → **My Profile** → **API Tokens** → **Create Token**
   - 選 **Edit Cloudflare Workers** 範本
   - 在 Permissions 再按「+ Add more」，加一列：`Account` / `D1` / `Edit`
   - 建立後抄下 Token（只會顯示一次）

### 3️⃣ 建立 GitHub Repo 並設定 Secrets
1. 在 GitHub 建立新 repo，例如 `voca-bot`。建議選 **Public**，Actions 就沒有使用分鐘數限制；金鑰放在 Secrets 裡，別人看不到
2. 進入 repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**，新增以下 5 個：

| Name | Value |
|------|-------|
| `CLOUDFLARE_API_TOKEN` | 2️⃣ 的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | 2️⃣ 的 Account ID |
| `LINE_CHANNEL_SECRET` | 1️⃣ 的 Channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | 1️⃣ 的 Channel access token |
| `CRON_SECRET` | 自己打一串長亂碼，例如 `voca-8f3k2m9x7q` |

### 4️⃣ 上傳程式碼（只需要做這一次）
在這個資料夾打開終端機：
```bash
git init
git add .
git commit -m "init voca bot"
git branch -M main
git remote add origin https://github.com/<你的帳號>/voca-bot.git
git push -u origin main
```
push 之後到 GitHub → **Actions** → **Deploy**，等它變成綠色 ✅。這個流程會自動建立資料庫和資料表，並完成部署。

### 5️⃣ 設定 Webhook
1. 打開 Deploy 執行紀錄的「部署 Worker」步驟，找到網址，例如 `https://voca-bot.xxx.workers.dev`
2. 回到 GitHub Secrets，新增第 6 個：`WORKER_URL`，值填上面那個網址
3. 回到 LINE Developers → Messaging API → **Webhook URL** 填 `https://voca-bot.xxx.workers.dev/webhook`
   → 按 **Verify** 出現 Success → 打開 **Use webhook**

### 6️⃣ 開始使用 🎉
用手機掃 Messaging API 頁的 QR Code 加好友，會馬上收到歡迎訊息和今天的 5 個單字。

---

## 使用方式

| 輸入 | 功能 |
|------|------|
| `今日` | 今天的 5 個單字（排程還沒跑的話會立刻送出） |
| `收藏` | 收藏清單（不熟的字），`收藏 2` 看第 2 頁 |
| `複習收藏` | 隨機抽 10 個收藏字，用卡片複習 |
| `已學` | 學過的單字，依日期分組 |
| `查 audit` 或直接輸入 `audit` | 查詢已學過的單字 |
| `查 預算` | 用中文找已學過的單字 |
| `收藏 audit` / `移除 audit` | 打字加入或移除收藏 |
| `測驗` | 四選一測驗（英翻中、中翻英），答錯會自動收藏 |
| `額度` | 查看本月 LINE 推播額度用了多少 |
| `停止推播` / `開始推播` | 關閉或開啟每日推播 |

單字卡上有 **⭐ 收藏**（按一下就收藏）和 **🔊 發音**（開 Cambridge 字典聽發音）按鈕。
每則回覆下方也有快速按鈕，不用打字。

> 💡 想要底部固定選單（圖文選單）的話，到 LINE Official Account Manager → **圖文選單** → 建立，
> 每格動作選「文字」，分別填 `今日`、`收藏`、`複習收藏`、`已學`、`測驗`、`說明`。

---

## 測試推播
GitHub → Actions → **Daily words** → **Run workflow**
- 不勾 force：今天已經送過的話會跳過，回傳 `"already":1`
- 勾 force：強制再送一批。這會讓進度前進到下一天，測試時才用

---

## 新增單字
1. 在 `data/words/` 新增 `batch03.json`，格式照 `batch01.json`，`id` 接著 101 往下編
2. 在 `src/words.js` 加上 import，並把它接在 `WORDS` 最後面
3. `git push` 後會自動檢查格式並部署

⚠️ 已上線的單字**不要刪除或改順序**，使用者的進度是照順序記錄的，新單字只能加在後面。

想要我幫你產生更多單字，直接說「再產生 100 個多益金色單字」就可以。

---

## 本機開發（可選）
```bash
npm install
npm test                 # 檢查單字 + 端到端測試（不需要網路和帳號）
cp .dev.vars.example .dev.vars   # 填入金鑰
npx wrangler dev         # 本機啟動
```

## 免費額度

| 服務 | 免費額度 | 本專案用量 |
|------|----------|-----------|
| LINE 推播 | 每月 200 則 | 每人每天 1 則：5 張卡片放在同一個訊息裡，一個月約 30 則（回覆類訊息不計） |
| Cloudflare Workers | 每天 10 萬次請求 | 數十次 |
| Cloudflare D1 | 5 GB | 幾 MB |
| GitHub Actions | Public repo 不限 | 每天約 1 分鐘 |

使用者超過 6 人時，LINE 推播額度會不夠。這時可以請大家改成每天自己輸入「今日」，回覆訊息不計入額度。
