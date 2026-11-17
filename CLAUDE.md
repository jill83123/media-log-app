# CLAUDE.md — Agent 入口（先讀這份，再決定要開哪些檔）

書影紀錄 PWA：Vue 3 + Pinia + Vue Router(hash) + Dexie(IndexedDB) + Tailwind 4 + Vite；`worker/` 是 Cloudflare Worker（搜尋代理／Google 登入／推播）。繁體中文、手機優先、離線優先。
更細的產品決策在 [docs/DECISIONS.md](docs/DECISIONS.md)，功能清單與部署在 [README.md](README.md)；**找程式位置先看本檔，不要全專案 grep／逐檔讀**。

## 維護規則（必做）
每次改動若影響下列任一項，**同一次改動內**更新本檔對應段落（只改受影響的那一行，保持精簡）：
新增／刪除／改名檔案、路由、資料表或欄位、store 欄位、`lib/` 的公開函式、設定項、指令。
本檔只放「在哪、做什麼」，不放實作細節；一行一個檔案，說明 ≤ 1 句。

## 指令
`npm run dev`（5173）· `npm test`（vitest，含 worker 解析器）· `npm run type-check` · `npm run lint` · `npm run build`
UI 變更用 preview（`.claude/launch.json` 的 `dev`）驗證；`#/dev` 是元件試玩頁，可載入示範資料。

## 資料層 `src/db/`
- `types.ts`：所有實體型別。`Base{id,updatedAt,deleted?}`（刪除=墓碑，不真刪）；`Work`、`Series`(+`SeriesReview`)、`Rec`（一個週目/round，含 status、progress、rating 0.5–5|null、start/end 模糊日期）、`WorkNote`（kind:'note'=筆記，無=心得）、`ProgressLog`（每個週目每天一筆「該日進度到哪」，id 由週目+日期組成）、`Tag`、`Category`；`TableMap`/`TableName` = 會同步的表。
- `index.ts`：Dexie `AppDB`，表 works/series/records/notes/progressLogs/tags/categories/meta/images；版本遷移目前到 v7（改 schema 要加新 version）。`images` 只存本機封面 blob；`meta` 表目前沒有程式使用。
- 模糊日期＝字串 `''|YYYY|YYYY-MM|YYYY-MM-DD`（`lib/date.ts`）。

## Stores `src/stores/`（Pinia）
- `data.ts` `useData`：所有未刪除列的記憶體快取（works/series/records/notes/progressLogs/tags/categories）＋衍生 `workById`、`tagUse`、`tagsByUse`、`latestRecord`、`library`（作品頁清單）。IndexedDB 變動會自動刷新。
- `settings.ts` `useSettings`：本機設定 `s`（theme、themeColor、ratings、types、units、workerUrl、sourcesByType、libraryView、提醒…，存 localStorage）；`sharedValues/applyShared` 供同步共用設定（ratings、units、types）。
- `sync.ts` `useSync`：Google 同步狀態與動作（connect/syncNow/備份/還原），開啟、變更後、離開時自動同步。
- `push.ts` `usePush`：推播訂閱與提醒開關。
- `ui.ts` `useUi`：toast、`confirm`/`prompt` 對話框（UiLayer 顯示）。

## 邏輯 `src/lib/`（純函式優先，`*.test.ts` 同名）
寫入資料一律走 **`repo.ts`**，不要在畫面直接 `db.xxx.put`。
- `repo.ts`：`createWork/createRecord/startNewRound/setProgress/logProgress/logChange/setStatus/removeRecord/removeWork`、`createTag/Series/Category`、`removeTag/Series/Category`、`put/remove`（通用）、`migrateCategoriesToTags`。
- `meta.ts`：作品類型（`DEFAULT_TYPES`、`allTypes/workTypes`、`typeLabel/typeUnit`）、狀態（`STATUSES`、`statusLabel`）、進度文字（`progressText/progressRatio`）。
- `ratings.ts`：評分等級（檔位 0.5–5 ↔ 顯示分數；`scoreOf/starsOf/formatScore/formatRating`）。
- `date.ts`：模糊日期運算與格式（`precision/within/earliest/latest/daysSpan/formatFuzzy/monthGrid…`）。
- `filter.ts`：作品庫篩選（`LibraryFilter`、`matches`、`descendants`、`yearsOf`）。
- `seriesList.ts`：系列列表資料（`seriesRows`）。
- `stats.ts`：統計（`rangeOf`、`itemsOf`、`summarize`、`eventsOf`、`dayCounts`、`heatWeeks`）。
- `search.ts`：搜尋來源設定與呼叫 Worker（`searchWorks/fetchDetail/toWorkDraft/findExisting/sourcesFor`、`WORKER_URL`、`proxiedImage`）。
- `covers.ts`：封面解析（網址／本機／`drive:<id>` 下載）`useCover`；`image.ts` 壓縮上傳圖；`imageGc.ts` 清掉沒人引用的本機圖。
- `reminders.ts` 算提醒時段；`push.ts` 瀏覽器端推播＋呼叫 Worker。
- `themes.ts` 主題色；`chinese.ts` 簡→繁（opencc 延遲載入）；`updater.ts` PWA 更新提示；`demo.ts` 示範資料（DevView 用）。
- UI 小工具：`uiIcons.ts`（lucide 圖示統一匯出，新圖示加在這）、`dragScroll.ts`（v-drag-scroll）、`reorderAnim.ts`（排序動畫/拖曳）、`scrollLock.ts`、`id.ts`（`uid/shuffle`）。
- `google/`：`gis.ts` 授權碼流程與 token（經 Worker）；`drive.ts` Drive appdata REST；`syncEngine.ts` `runSync`、備份/還原/匯出；`merge.ts` 以 updatedAt 逐列合併＋墓碑清理。

## 路由與畫面 `src/router/index.ts`、`src/views/`
| 路由 | 檔案 | 備註 |
|---|---|---|
| `/` | `LibraryView` | 作品頁：搜尋、篩選、排序、時間軸/格狀、**作品／系列分頁**（系列用 `SeriesList`）、同步雲圖示 |
| `/work/:id` | `WorkView` | 作品詳情：週目、評分、進度、心得/筆記 |
| `/work/new`、`/work/:id/edit` | `WorkEditView` | 新增/編輯作品（`CoverSearchSheet` 搜尋封面） |
| `/series/:id` | `SeriesView` | 系列頁：作品排序、系列評分與總心得 |
| `/stats` | `StatsView` | 分頁「總覽」`stats/OverviewTab`（內含 `HeatmapTab`）、「心得」`stats/ReviewsTab` |
| `/calendar` | `CalendarView` | 月曆（用 `stats/CalendarTab`） |
| `/settings` | `SettingsView` | 入口；子頁 `views/settings/`：Types、Ratings、Appearance、Sources、Notify、Sync |
| `/manage/tags` | `ManageView` | 標籤管理（依使用次數排序） |
| `/dev` | `DevView` | 元件試玩 |
`meta.nav` = 底部導覽項目。捲動位置行為與 `scroll` 狀態在 router/index.ts。

## 元件 `src/components/`（全部自寫，不用原生 select/date 等）
- 版面：`BottomSheet`（所有底部面板的底）、`PopupDialog`、`UiLayer`（toast+對話框容器，App 掛一次）、`PageHeader`、`PillTabs`。
- 表單：`SelectField`、`PickSheet`、`NamePickSheet`（選/新建 標籤、分類、系列）、`CheckField`、`ToggleSwitch`、`FuzzyDateField`+`FuzzyDateSheet`、`TimePickerSheet`。
- 作品相關：`WorkCover`、`StatusPill`、`RatingBadge/RatingStars/RatingList/RatingSheet`、`ProgressSheet`、`RecordSheet`（編輯週目）、`NoteSheet`（心得/筆記）、`SeriesList`。
- `CoverSearchSheet`：線上查標題/封面/作者。

## Worker `worker/`（獨立部署，wrangler；CI 不含）
`src/index.js` 路由（`/search`、`/detail`、`/img`、`/config`、`/token`、`/refresh`、`/revoke`、`/push*`）· `sources.js` 各來源解析器（純函式，`sources.test.js`）· `img.js` 防盜連圖片代理（白名單）· `push.js` Web Push 與排程提醒（Durable Object）· `scripts/`（`deploy.mjs`、`gen-vapid.mjs`、`sync-config.mjs`）。前端對應：`lib/search.ts`、`lib/google/gis.ts`、`lib/push.ts`、`public/push-sw.js`。

## 樣式規則（Tailwind 4，全域樣式只在 `src/assets/main.css`）
- **只用語意色，不寫死色碼**：`bg-bg`（頁面）`bg-surface`（卡片）`bg-surface-2`（按下/區塊底）`text-ink`（主文）`text-muted`（次要）`border-line`（邊線）`primary`/`primary-soft`/`primary-strong`（強調）`danger`/`success`/`warn`。皆為 CSS 變數（`:root` / `.dark`），改色改 main.css 變數，不要在元件寫 `dark:` 覆寫或 `#hex`。
- **深淺色**：`<html>` 加 `.dark`；`--primary` 由 `settings.applyTheme` 依 `lib/themes.ts`（棕／藍，各有 light/dark 色）寫入。新增主題色＝在 `THEMES` 加一筆。
- **背景近白，卡片靠細邊框＋極淡陰影區分**，不用灰底；陰影用 `--shadow` / `--shadow-lg`。
- **共用 class（`@layer components`，先用它們再手寫 utility）**：`.card`、`.btn` + `.btn-primary|soft|ghost|danger|sm`、`.icon-btn`、`.circle-btn`、`.input`（16px 防 iOS 縮放，min-h-12）、`.label`、`.chip`/`.chip-on`、`.tag`、`.section-title`、`.sticky-header`（頁面標題）、`.empty-state`（空白頁文字置中）、`.inset-divide`（列表縮排分隔線）、`.scrollbar-none`。
- **字級**：內文與可點元素 14px（`text-sm`），細字 12px（`text-xs`）；標題 `text-lg font-bold`。圓角 `rounded-2xl`（卡片/輸入/按鈕）、`rounded-xl`（小按鈕/列）、`rounded-full`（chip/pill）。觸控目標 ≥ 36–44px。
- **手機優先**：最外層容器已在 `App.vue` 設好（`max-w-xl mx-auto px-4`、頂部 `--page-pt`），頁面不必重複；底部導覽 z-30、底部用 `env(safe-area-inset-bottom)`；高度用 `dvh`。
- **層級 z-index**：頁內 sticky 10–20 → 下拉／底部導覽 30 → BottomSheet 40（`high` 時 65）→ 子彈窗 60（RecordSheet、SeriesView）→ PopupDialog 與 toast 70 → UiLayer 對話框 75（最上）。新浮層沿用此區間。
- **狀態色**走 `meta.ts` 的 `STATUSES[].tone`（`StatusPill`），不要另外寫。
- **動畫**：`fade`、`sheet`（底部滑入）、`reorder-move`、頁面進場 `page-in`；一律 `var(--ease-out)`，已支援 `prefers-reduced-motion`。
- **互動細節**：按下 `active:scale-*`；hover 效果包在 `@media (hover: hover)`；鍵盤焦點環 `:focus-visible`；禁雙擊縮放（`touch-action: pan-x pan-y`）。
- **不用原生元件**（select、date、number 箭頭、alert/confirm）：改用 `SelectField`、`FuzzyDateSheet`、`useUi().confirm`。
- 元件內 `<style scoped>` 只在極少數需要（現僅 `TimePickerSheet`、`SourcesPage`），其餘用 utility。

## 建置與部署
`vite.config.ts`（PWA、`@` 別名＝`src/`、`__APP_VERSION__`）· `.github/workflows/deploy.yml`（main → 測試、建置、GitHub Pages；只改 `worker/`、文件（`*.md`、`docs/`）、`.claude/`、編輯器、prettier、lint 設定時不觸發（測試檔照常觸發，因為 CI 會跑測試）；新增不影響網站的檔案類型時要加進 `paths-ignore`）· `vitest.config.ts` + `src/__tests__/setup.ts`（fake-indexeddb）。

## 慣例
- 程式註解與使用者介面為繁中文案／英文註解並存；沿用現有風格，prettier（`npm run format`）。
- 刪除＝設 `deleted`；任何新表要同時加進 `TableMap`、Dexie 新 version、同步（`syncEngine`/`merge`）。
- 新增設定：`LocalSettings` 加欄位；要跨裝置同步的放 `sharedValues`。
- 新增功能後補 `lib/*.test.ts`（純邏輯）；commit 用 `/commit` skill（先給使用者看訊息）。
