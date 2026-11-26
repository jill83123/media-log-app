# 書影紀錄

個人用、離線優先的書影紀錄 PWA，涵蓋動畫、漫畫、小說、書籍、電影、劇集。

資料存在瀏覽器的 IndexedDB，可同步到自己 Google 雲端硬碟的 App 專用隱藏資料夾（資料＋封面圖片）。設計決策見 [docs/DECISIONS.md](docs/DECISIONS.md)。

## 功能

### 紀錄
- **狀態**：未看／在看／閒置／看完／拋棄
- **進度**：自訂單位、可設為無限進度；每天會記下當天進度到哪（範圍與差距），明顯比平常快的日子會標示，編輯時可選擇是否連動後一天
- **評分**：預設十級，等級可新增、刪除，每級的分數數字（如 10、9.5、85）、名稱、說明都能自訂；可不評分
- **文字**：心得、隨手筆記（可標註寫在哪個進度）；系列也有自己的評分與總心得
- **日期**：開始／結束日期可只填年或年月，自動計算共花天數
- **再看一次**：新增下一輪，舊輪次與進度歷史保留

### 整理
- 系列、標籤（系列可設標籤，底下作品一併套用，主圖可從作品封面挑或自行上傳；標籤管理頁依使用次數排序）；作品類型可自訂名稱、單位與順序
- 作品頁分「作品」「系列」兩個分頁，兩邊都能排序（作品：時間、評分、標題；系列另有自訂順序、作品數），可依評分、年份、狀態、標籤篩選（系列分頁可依標籤與評分篩選）
- 作品可在「時間軸」與小封面「格狀」兩種版面間切換
- 作品詳情的作者／製作可逐一點開，列出同一位作者或製作的所有作品（不分類型）

### 搜尋與封面
- 來源：動畫瘋、Bangumi、豆瓣、博客來、BOOK☆WALKER、Goodreads（另有 Open Library 備援），依作品類型預設不同來源，經 Cloudflare Worker 代理
- 只取標題、封面、作者與集數，不抓簡介、年份、ISBN
- 套用時可逐項選擇要帶入的資料；來源有提供時，作者／製作分成原作、導演、製作、出版各自勾選，預設只勾原作（電影預設勾導演）
- 也可手動錄入、自行上傳封面

### 統計
- 作品頁、統計、日曆共用類型選擇（可選「全部」看所有類型），統計頁依時間範圍（含自訂、單一年份）篩選；「總覽」有看完／在看／閒置／拋棄的數量、活動熱力圖、評分分佈與平均分，「心得」列出範圍內的所有心得
- 月曆：獨立的「月曆」頁

### 其他
- Google 雲端硬碟同步；雲端自動與手動備份各保留最近 3 份，也能匯出／匯入 JSON
- 通知推播：每日提醒（今天已有紀錄就跳過）
- 主題：棕（預設）／藍；淺色／深色／跟隨系統

## 技術棧

Vue 3 · Pinia · Vue Router · Dexie (IndexedDB) · Tailwind CSS 4 · Vite · Vitest · Cloudflare Workers

## 開發

需要 Node.js `^22.18.0` 或 `>=24.12.0`。

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 單元測試（含 Worker 的解析器）
npm run build
```

`#/dev` 是元件試玩頁，可載入示範資料。

## 部署

依序完成三個部分：前端 → Worker → Google。

### 1. 前端（GitHub Pages）

1. 推到 GitHub 的 `main`，`.github/workflows/deploy.yml` 會自動測試、建置並部署。
2. Pages 設定選「GitHub Actions」。
3. （選用）要在建置時固定 Worker 網址，在 repo 的 Actions variables 設定 `VITE_WORKER_URL`；也可以在 App 設定頁手動填。

### 2. Worker（搜尋代理、Google 登入、推播）

```bash
cd worker
npm install
npm run deploy      # 第一次會建立 wrangler.local.toml，有未填的項目就停下並列出
node scripts/gen-vapid.mjs   # 產生推播 VAPID 金鑰（deploy 提示缺 VAPID_ 項目時執行）
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

在 `wrangler.local.toml` 填入：

| 欄位 | 說明 |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth 用戶端 ID |
| `ALLOWED_ORIGINS` | 你的 GitHub Pages 網址 |
| `VAPID_SUBJECT` | 推播聯絡資訊，`mailto:你的信箱` 或網站網址，不可留空 |

### 3. Google

1. 在 Google Cloud Console 建專案，啟用 **Google Drive API**。
2. 建立 OAuth 用戶端（網頁應用程式），「已授權的 JavaScript 來源」加入 GitHub Pages 網址與 `http://localhost:5173`。
3. OAuth 同意畫面的範圍只加入 `drive.appdata`：資料存在 App 專用的隱藏資料夾，不會出現在雲端硬碟檔案列表。
4. 在 App「設定 → 同步與服務」填 Worker 網址，按「連線 Google 雲端硬碟」。

**雲端資料結構**：隱藏資料夾裡有一個 `media-log.json`，封面圖片也放在同一處。刪除作品或換封面後，用不到的圖片會在下次同步時從雲端與本機一併清掉。

## 已知限制

- **搜尋來源**：豆瓣、博客來可能封鎖 Worker 所在的資料中心 IP；被擋時該來源顯示「暫時無法使用」，其他來源照常。
- **同步衝突**：以「每筆資料最後修改者勝出」合併，沒有逐欄衝突提示。
- **推播**：內容在排程當下就決定，資料變動後約 15 秒內會重新排程；iPhone 需先加入主畫面。
- **封面圖片**：只有自己上傳的封面會存到 Drive，爬蟲取得的封面只存網址。
