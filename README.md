# 書影紀錄

個人用、離線優先的書影（動畫、漫畫、小說、書籍、電影、劇集）紀錄 PWA。資料存在瀏覽器的 IndexedDB，可同步到自己 Google 雲端硬碟的 App 專用隱藏資料夾（資料＋封面圖片）。決策與設計見 [docs/DECISIONS.md](docs/DECISIONS.md)。

## 功能

- 作品與紀錄：狀態（未看／在看／閒置／看完／拋棄）、進度（自訂單位、無限進度）、評分（可不評分）、心得、今日筆記、開始／結束日期（可只填年或年月）、共花天數。
- 再看一次：新增下一輪，舊輪次與進度歷史保留。
- 系列、標籤、分類；作品頁以小封面格狀顯示，依時間新到舊。
- 評分十級：分數數字、名稱、說明都能改（也可一鍵換 5／10／100 分制）。
- 搜尋：Bangumi、豆瓣、博客來、Goodreads（另有 Open Library 備援），經 Cloudflare Worker 代理，只取封面與作者（簡介、年份、ISBN 不抓）；也可手動錄入、自行上傳封面。
- 統計：類型與時間範圍篩選，總覽、熱力圖、時間軸、月曆。
- Google 同步、通知推播（每日提醒、久沒更新提醒）。
- 主題：藍／棕，淺色／深色。

## 開發

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 單元測試（含 Worker 的解析器）
npm run build
```

`#/dev` 是元件試玩頁，可載入示範資料。

## 部署

### 1. 前端（GitHub Pages）

推到 GitHub 的 `main`，`.github/workflows/deploy.yml` 會測試、建置並部署。Pages 設定選「GitHub Actions」。
若要在建置時固定 Worker 網址，在 repo 的 Actions variables 設定 `VITE_WORKER_URL`（也可以在 App 設定頁手動填）。

### 2. Worker（搜尋代理、Google 登入、推播）

```bash
cd worker
npm install
npm run deploy      # 第一次會建立 wrangler.local.toml 與 VAPID 金鑰，照提示填入
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

在 `wrangler.local.toml` 填 `GOOGLE_CLIENT_ID`、`ALLOWED_ORIGINS`（你的 GitHub Pages 網址）、`VAPID_SUBJECT`。

### 3. Google

1. Google Cloud Console 建專案，啟用 **Google Drive API**。
2. 建立 OAuth 用戶端（網頁應用程式），「已授權的 JavaScript 來源」加入 GitHub Pages 網址與 `http://localhost:5173`。
3. OAuth 同意畫面的範圍加入 `drive.appdata`（只用這一個）：資料存在 App 專用的隱藏資料夾，不會出現在雲端硬碟檔案列表。
4. 在 App「設定 → 同步與服務」填 Worker 網址，按「連線 Google」。

資料是隱藏資料夾裡的一個 `media-log.json`，封面圖片也放在同一處。刪除作品或換封面後，用不到的圖片會在下次同步時從雲端與本機一併清掉。

## 已知限制

- 豆瓣、博客來可能封鎖 Worker 所在的資料中心 IP；被擋時該來源顯示「暫時無法使用」，其他來源照常。
- 同步以「每筆資料最後修改者勝出」合併，沒有逐欄衝突提示。
- 推播內容在排程當下就決定，資料變動後約 15 秒內會重新排程；iPhone 需先加入主畫面。
- 圖片只有自己上傳的封面會存到 Drive，爬蟲取得的封面只存網址。
