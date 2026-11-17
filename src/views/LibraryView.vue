<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { emptyFilter, filterCount, matches, yearsOf } from '@/lib/filter'
import { earliest, today } from '@/lib/date'
import type { Rec, Work, WorkType } from '@/db/types'
import { progressRatio, progressText, statusLabel, STATUSES, allTypes, typeLabel, workTypes } from '@/lib/meta'
import { formatScore, mergeRatings } from '@/lib/ratings'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useSync } from '@/stores/sync'
import { useRouter } from 'vue-router'
import { loadDemo } from '@/lib/demo'
import { useUi } from '@/stores/ui'
import { ArrowUpDown, Check, X, GalleryVerticalEnd, ChevronDown, ChevronLeft, Cloud, Filter, LoaderCircle, LayoutGrid, List, Plus, Search } from '@/lib/uiIcons'
import { seriesRows } from '@/lib/seriesList'
import { createSeries, put } from '@/lib/repo'
import PopupDialog from '@/components/PopupDialog.vue'
import PillTabs from '@/components/PillTabs.vue'
import SeriesList from '@/components/SeriesList.vue'
import RatingBadge from '@/components/RatingBadge.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import PickSheet from '@/components/PickSheet.vue'
import StatusPill from '@/components/StatusPill.vue'
import WorkCover from '@/components/WorkCover.vue'

const data = useData()
const settings = useSettings()
const sync = useSync()
const router = useRouter()
const route = useRoute()
const ui = useUi()
async function tryDemo() {
  await loadDemo()
  ui.toast('已載入示範資料', 'success')
}
/** the cloud at the top left: how the Google sync is doing; tapping syncs, or opens the sync page when it needs attention */
const syncInfo = computed(() => {
  switch (sync.status) {
    case 'syncing': return { text: '同步中', dot: '' }
    case 'dirty': return { text: '有變更待同步', dot: 'bg-warn' }
    case 'error': return { text: '同步失敗', dot: 'bg-danger' }
    case 'login': return { text: '需要重新連線', dot: 'bg-danger' }
    case 'idle': return { text: '已同步', dot: 'bg-success' }
    default: return { text: '未連線 Google', dot: '' }
  }
})
function syncTap() {
  if (!sync.connected || sync.status === 'error' || sync.status === 'login') void router.push('/settings/sync')
  else if (sync.status !== 'syncing') void sync.syncNow()
}
const thisYear = today().slice(0, 4)
/** the list is always of one type: a saved "everything" (or a type that is gone) falls back to the first one */
if (!workTypes().some((t) => t.value === settings.s.libraryType)) settings.s.libraryType = workTypes()[0]?.value ?? ''
/** the list shows every year until one is picked */
const f = ref({ ...emptyFilter(), types: settings.s.libraryType ? [settings.s.libraryType] : [] })
/** a tag chip on a work page lands here with ?tag=: show everything carrying it */
function applyQuery() {
  const { tag, type } = route.query
  // the tag is looked at within the type of the work it was tapped on
  if (typeof tag === 'string') f.value = { ...emptyFilter(), tagIds: [tag], types: typeof type === 'string' ? [type as WorkType] : [] }
}
/** on a tag's page the title is the tag, not a type */
const tagName = computed(() => (typeof route.query.tag === 'string' ? (data.tags.find((t) => t.id === route.query.tag)?.name ?? '標籤') : ''))
applyQuery()
watch(() => route.query, applyQuery)
const typeOpen = ref(false)
/** the title is the type picker; the last pick is remembered for next time */
const typeItems = computed(() => workTypes(settings.s.libraryType).map((t) => ({ value: t.value, label: t.label })))
const typeValue = computed(() => settings.s.libraryType)
const typeTitle = computed(() => (settings.s.libraryType && allTypes().some((t) => t.value === settings.s.libraryType) ? typeLabel(settings.s.libraryType) : '作品'))
function pickType(v: string) {
  settings.s.libraryType = v
  f.value.types = v ? [v] : []
}
/** the stats page shares this pick and may change it while this page is kept alive */
watch(
  () => settings.s.libraryType,
  (v) => (f.value.types = v ? [v] : []),
)
const sheet = ref(false)
/** the works, or the series of this type */
const libTab = ref<'works' | 'series'>('works')
/** a new series is made from its name, and opens right away to put works in */
const newSeriesOpen = ref(false)
const newSeriesName = ref('')
async function addSeries() {
  const name = newSeriesName.value.trim()
  if (!name) return
  const id = await createSeries(name)
  newSeriesName.value = ''
  newSeriesOpen.value = false
  void router.push(`/series/${id}`)
}

/** one row per round: a work that was read twice shows up twice, each with its own status, rating and dates */
const allRows = computed(() => {
  const by = new Map<string, Rec[]>()
  for (const r of data.records) by.set(r.workId, [...(by.get(r.workId) ?? []), r])
  const rowKey = (x: { work: Work; record?: Rec }) => Math.max(x.record?.updatedAt ?? 0, x.work.updatedAt, Date.parse(earliest(x.record?.end ?? '')) || 0)
  const out = data.works.flatMap((work) => {
    const rs = (by.get(work.id) ?? []).sort((a, b) => a.round - b.round)
    return rs.length ? rs.map((record) => ({ work, record, rounds: rs.length })) : [{ work, record: undefined as Rec | undefined, rounds: 0 }]
  })
  return out.sort((a, b) => rowKey(b) - rowKey(a))
})
/** the filter only offers what the list (of the chosen type) really has: a year or a tag nothing uses is left out */
const scopeWorks = computed(() => (f.value.types.length ? data.works.filter((w) => f.value.types.includes(w.type)) : data.works))
const yearChoices = computed(() => {
  const ids = new Set(scopeWorks.value.map((w) => w.id))
  const all = new Set<string>()
  const dated = new Set<string>()
  for (const r of data.records) {
    if (!ids.has(r.workId)) continue
    dated.add(r.workId)
    for (const y of yearsOf([r], thisYear)) all.add(y)
  }
  // a work with no rounds counts as the current year
  if (scopeWorks.value.some((w) => !dated.has(w.id))) all.add(thisYear)
  // the year being filtered on stays, so it can still be switched off
  if (f.value.year) all.add(f.value.year)
  return [...all].sort().reverse()
})
const tagChoices = computed(() => data.tagsByUse.filter((t) => f.value.tagIds.includes(t.id) || scopeWorks.value.some((w) => w.tagIds.includes(t.id))))
/** what to order by, and the two ways of each (the first is 'down') */
const WORK_SORTS = [
  { value: 'time', label: '時間', dirs: ['新到舊', '舊到新'] },
  { value: 'rating', label: '評分', dirs: ['高到低', '低到高'] },
  { value: 'title', label: '標題', dirs: ['正序', '倒序'] },
] as const
const SERIES_SORTS = [
  { value: 'time', label: '修改時間', dirs: ['新到舊', '舊到新'] },
  { value: 'custom', label: '自訂順序', dirs: ['', ''] },
  { value: 'rating', label: '評分', dirs: ['高到低', '低到高'] },
  { value: 'name', label: '名稱', dirs: ['正序', '倒序'] },
  { value: 'count', label: '作品數', dirs: ['多到少', '少到多'] },
] as const
const workDirs = computed(() => WORK_SORTS.find((o) => o.value === settings.s.librarySort)!.dirs)
const seriesDirs = computed(() => SERIES_SORTS.find((o) => o.value === settings.s.seriesSort)!.dirs)
/** by score: the unscored always last, whichever way */
function byScore<T>(list: T[], score: (x: T) => number | null | undefined, down: boolean) {
  return [...list].sort((a, b) => {
    const ra = score(a)
    const rb = score(b)
    if (ra == null || rb == null) return ra == null && rb == null ? 0 : ra == null ? 1 : -1
    return down ? rb - ra : ra - rb
  })
}
const rows = computed(() => {
  const list = allRows.value.filter((x) => matches(x, f.value, data.categories, yearsOf(x.record ? [x.record] : [], thisYear)))
  const down = settings.s.libraryDir === 'down'
  const s = settings.s.librarySort
  if (s === 'title') return [...list].sort((a, b) => (down ? 1 : -1) * a.work.title.localeCompare(b.work.title, 'zh-Hant'))
  if (s === 'rating') return byScore(list, (x) => x.record?.rating, down)
  // the list is already newest first
  return down ? list : [...list].reverse()
})
/** the series tab's own filter: a score at least, or the unscored */
const sMinRating = ref(0)
const sUnrated = ref(false)
const seriesList = computed(() => {
  const q = f.value.query.trim().toLowerCase()
  const type = settings.s.libraryType
  // a series with no works yet belongs to no type: it is listed under every one, so it can be found and filled
  let list = seriesRows(data.series, data.works).filter((r) => (!type || !r.group || r.group === type) && (!q || r.name.toLowerCase().includes(q)))
  if (sUnrated.value) list = list.filter((r) => r.rating == null)
  else if (sMinRating.value) list = list.filter((r) => (r.rating ?? 0) >= sMinRating.value)
  const s = settings.s.seriesSort
  const down = settings.s.seriesDir === 'down'
  if (s === 'name') return [...list].sort((a, b) => (down ? 1 : -1) * a.name.localeCompare(b.name, 'zh-Hant'))
  if (s === 'count') return [...list].sort((a, b) => (down ? b.count - a.count : a.count - b.count))
  if (s === 'time') return [...list].sort((a, b) => (down ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt))
  if (s === 'rating') return byScore(list, (r) => r.rating, down)
  return list
})

// ---- the hand-made order: press and hold a series to edit it, then 完成 saves ----
const ordering = ref(false)
const draftIds = ref<string[]>([])
/** while editing: every series of this type in its own order, nothing searched or filtered away */
const editRows = computed(() => seriesRows(data.series, data.works).filter((r) => !settings.s.libraryType || !r.group || r.group === settings.s.libraryType))
function startOrdering() {
  draftIds.value = editRows.value.map((r) => r.id)
  ordering.value = true
}
function cancelOrdering() {
  ordering.value = false
}
async function finishOrdering() {
  const next = draftIds.value
  ordering.value = false
  if (next.every((id, i) => id === editRows.value[i]?.id)) return
  // every series keeps its place in the whole order; the ones edited take the new order among the places they hold
  const all = data.series.map((s) => s.id)
  const slots = all.flatMap((id, i) => (next.includes(id) ? [i] : []))
  const order = [...all]
  next.forEach((id, k) => (order[slots[k]!] = id))
  for (const [i, id] of order.entries()) {
    const s = data.series.find((x) => x.id === id)
    // the rows are reactive proxies, which IndexedDB cannot store: copy them into plain data first
    if (s && s.order !== i) await put('series', { ...(JSON.parse(JSON.stringify(s)) as typeof s), order: i })
  }
  // show the order that was just made
  settings.s.seriesSort = 'custom'
}
// the list being edited is of one type: leaving that type, or the tab, ends the editing
watch([() => settings.s.libraryType, libTab], () => (ordering.value = false))
const seriesActive = computed(() => (sMinRating.value || sUnrated.value ? 1 : 0))
/** the number on the filter button: the type is what the list is of, not a filter, so it is not counted */
/** a tag's page lists each work once, whatever its rounds, with its best rating */
const tagWorks = computed(() => {
  const by = new Map<string, { work: Work; rating: number | null }>()
  for (const x of rows.value) {
    const cur = by.get(x.work.id) ?? { work: x.work, rating: null }
    if (x.record?.rating != null) cur.rating = Math.max(cur.rating ?? 0, x.record.rating)
    by.set(x.work.id, cur)
  }
  return [...by.values()]
})
const active = computed(() => filterCount({ ...f.value, types: [], tagIds: tagName.value ? [] : f.value.tagIds }))

/** timeline ⇄ grid; the button shows the layout it will switch to */
const NEXT = { timeline: 'grid', grid: 'timeline' } as const
const NEXT_LABEL = { timeline: '改為圖片格狀', grid: '改為時間軸' } as const
const view = computed(() => (settings.s.libraryView in NEXT ? (settings.s.libraryView as keyof typeof NEXT) : 'timeline'))

/** the timeline: newest first, grouped by the month the round ended (or started); rounds with no date go last */
/** 2026/11 → 2026 年 11 月 */
const monthTitle = (m: string) => m.replace(/^(\d{4})\/(\d{1,2})$/, (_, y, mo) => `${y} 年 ${Number(mo)} 月`)
/** the one group of a list that is not grouped by month */
const FLAT = '__flat'
const timeline = computed(() => {
  const keyOf = (r?: Rec) => {
    const d = r?.end || r?.start || ''
    return d ? (d.length <= 4 ? d : d.slice(0, 7)) : ''
  }
  const dated = rows.value
    .map((x) => ({ ...x, key: keyOf(x.record) }))
    .sort((a, b) => (a.key === b.key ? 0 : !a.key ? 1 : !b.key ? -1 : (a.key < b.key ? 1 : -1) * (settings.s.libraryDir === 'down' ? 1 : -1)))
  // a score or title order is one plain list, not months
  if (settings.s.librarySort !== 'time') return [{ month: FLAT, items: rows.value.map((x) => ({ ...x, key: '' })) }]
  const out: { month: string; items: typeof dated }[] = []
  for (const x of dated) {
    const g = out[out.length - 1]
    if (g && g.month === x.key) g.items.push(x)
    else out.push({ month: x.key, items: [x] })
  }
  return out
})

/**
 * When the round was: "11/10～11/13", one day alone as "11/13", still going as "11/10～". Two digits each so the cards line up;
 * the end carries its year ("26/01/01") only when it falls in another year than the start. Dates known only to the year or month are left out.
 */
function spanOf(r?: Rec) {
  const day = (d?: string) => (d && d.length === 10 ? d : '')
  const s = day(r?.start)
  const e = day(r?.end)
  const md = (d: string) => `${d.slice(5, 7)}/${d.slice(8)}`
  if (s && e) return s === e ? md(s) : `${md(s)}～${e.slice(0, 4) === s.slice(0, 4) ? '' : `${e.slice(2, 4)}/`}${md(e)}`
  return s ? `${md(s)}～` : e ? md(e) : ''
}
/** "小說 · 11/10～11/13（3 刷）": the type (unless the list is already one type), when, and the round in brackets after it (when there are several) */
const metaLine = (work: Work, record: Rec | undefined, rounds: number) =>
  [!settings.s.libraryType && typeLabel(work.type), `${spanOf(record)}${rounds > 1 && record ? `（${record.round} 刷）` : ''}`].filter(Boolean).join(' · ')

function toggle<T>(arr: T[], v: T) {
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(v)
}
/** the scores of the user's own levels, best first, to pick a minimum from */
const ratingSteps = computed(() => [0, ...mergeRatings(settings.s.ratings).map((l) => l.score)])
</script>

<template>
  <header class="sticky-header">
    <!-- editing the order: the header itself becomes cancel / save -->
    <template v-if="ordering">
      <button class="absolute left-4 inline-flex size-10 items-center justify-center text-ink transition active:scale-90" aria-label="取消" title="取消" @click="cancelOrdering"><X :size="24" /></button>
      <h1 class="text-base font-bold">調整順序</h1>
      <button class="absolute right-4 inline-flex size-10 items-center justify-center text-ink transition active:scale-90" aria-label="完成" title="完成" @click="finishOrdering"><Check :size="24" /></button>
    </template>
    <template v-else>
    <button v-if="route.query.tag" class="absolute left-4 inline-flex size-10 items-center justify-center text-muted transition active:scale-90" aria-label="返回" @click="router.back()"><ChevronLeft :size="24" /></button>
    <button v-else class="absolute left-4 inline-flex size-10 items-center justify-center text-muted transition active:scale-90" :aria-label="syncInfo.text" :title="syncInfo.text" @click="syncTap">
      <LoaderCircle v-if="sync.status === 'syncing'" :size="22" class="animate-spin" />
      <Cloud v-else :size="22" />
      <span v-if="syncInfo.dot" class="absolute top-2 right-1.5 size-2 rounded-full ring-2 ring-bg" :class="syncInfo.dot" />
    </button>
    <h1 v-if="tagName" class="max-w-[60%] truncate text-xl font-bold">{{ tagName }}</h1>
    <button v-else class="relative text-xl font-bold" aria-label="選擇作品類型" @click="typeOpen = true">{{ typeTitle }}<ChevronDown :size="18" class="absolute top-1/2 left-full ml-1 -translate-y-1/2 text-muted" /></button>
    <!-- on the series tab the plus makes a series -->
    <button v-if="libTab === 'series' && !tagName" class="absolute right-4 inline-flex size-10 items-center justify-center text-ink transition active:scale-90" aria-label="新增系列" title="新增系列" @click="newSeriesOpen = true"><Plus :size="24" /></button>
    <RouterLink v-else to="/work/new" class="absolute right-4 inline-flex size-10 items-center justify-center text-ink transition active:scale-90" aria-label="新增作品" title="新增作品"><Plus :size="24" /></RouterLink>
    <PickSheet v-model:open="typeOpen" :model-value="typeValue" title="作品類型" :items="typeItems" @pick="pickType" />
    </template>
  </header>

  <!-- while the order is edited the tabs and the search give way to the list -->
  <PillTabs v-if="!tagName && !ordering" v-model="libTab" size="sm" class="mb-4" :options="[{ value: 'works', label: '作品' }, { value: 'series', label: '系列' }]" />
  <div v-if="!ordering" class="mb-4 flex gap-2">
    <label class="input flex min-w-0 items-center gap-2">
      <Search :size="18" class="shrink-0 text-muted" />
      <input v-model="f.query" class="min-w-0 flex-1 bg-transparent outline-none" placeholder="搜尋標題、作者" />
    </label>
    <button v-if="!tagName && libTab === 'works'" class="icon-btn size-12 shrink-0 rounded-2xl" :aria-label="NEXT_LABEL[view]" @click="settings.s.libraryView = NEXT[view]">
      <LayoutGrid v-if="view === 'timeline'" :size="18" />
      <List v-else :size="18" />
    </button>
    <button v-if="!tagName && libTab === 'series'" class="icon-btn size-12 shrink-0 rounded-2xl" :aria-label="settings.s.seriesListView === 'grid' ? '改為列表' : '改為只顯示封面'" @click="settings.s.seriesListView = settings.s.seriesListView === 'grid' ? 'list' : 'grid'">
      <List v-if="settings.s.seriesListView === 'grid'" :size="18" />
      <LayoutGrid v-else :size="18" />
    </button>
    <button v-if="!tagName" class="icon-btn relative size-12 shrink-0 rounded-2xl" aria-label="排序與篩選" @click="sheet = true">
      <Filter :size="18" />
      <span v-if="libTab === 'series' ? seriesActive : active" class="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-primary text-xs font-bold text-white">{{ libTab === 'series' ? seriesActive : active }}</span>
    </button>
  </div>

  <SeriesList v-if="libTab === 'series' && !tagName" :rows="ordering ? editRows : seriesList" :searching="!!f.query.trim()" :editing="ordering" @edit="startOrdering" @order="draftIds = $event" />
  <template v-else>
  <div v-if="data.ready && !data.works.length" class="flex min-h-[55dvh] flex-col items-center justify-center gap-5 px-6 pt-10 text-center">
    <span class="grid size-14 place-items-center rounded-full bg-surface-2 text-muted"><GalleryVerticalEnd :size="26" /></span>
    <div>
      <p class="font-semibold">還沒有作品</p>
      <p class="mt-1 text-sm text-muted">新增第一部作品，輸入名稱就能搜尋封面與作者</p>
    </div>
    <div class="flex flex-wrap justify-center gap-2">
      <RouterLink to="/work/new" class="btn btn-soft px-6"><Plus :size="16" />新增作品</RouterLink>
    </div>
    <button class="text-xs text-muted underline underline-offset-2" @click="tryDemo">先載入示範資料看看</button>
  </div>
  <p v-else-if="data.ready && !rows.length" class="empty-state [--empty-top:14rem]">沒有符合的作品</p>

  <!-- a tag's page: just the works, one row each, with the best rating -->
  <ul v-if="tagName" class="space-y-2.5">
    <li v-for="{ work: w, rating } in tagWorks" :key="w.id">
      <RouterLink :to="`/work/${w.id}`" class="card flex h-[72px] items-center gap-3 overflow-hidden px-3">
        <WorkCover :src="w.cover" :title="w.title" :icon-size="13" class="h-[52px] w-[37px] shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm leading-tight font-medium">{{ w.title }}</p>
          <p v-if="w.creators" class="mt-px truncate text-xs leading-tight text-muted">{{ w.creators }}</p>
        </div>
        <RatingBadge v-if="rating != null" :value="rating" class="shrink-0 text-xs leading-none" />
      </RouterLink>
    </li>
  </ul>

  <!-- timeline: grouped by month, each card says on which day; rounds in progress show their progress bar -->
  <template v-else-if="view === 'timeline'">
    <div v-for="g in timeline" :key="g.month" class="mb-5">
      <h2 v-if="g.month !== FLAT" class="section-title">{{ g.month ? monthTitle(g.month) : '未填日期' }}</h2>
      <ul class="space-y-2.5">
        <li v-for="{ work, record, rounds } in g.items" :key="work.id + (record?.id ?? '')">
          <RouterLink :to="`/work/${work.id}`" class="card flex h-[72px] items-center gap-3 overflow-hidden px-3">
            <WorkCover :src="work.cover" :title="work.title" :icon-size="13" class="h-[52px] w-[37px] shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm leading-tight font-medium">{{ work.title }}</p>
              <p v-if="metaLine(work, record, rounds)" class="mt-px text-xs leading-tight text-muted">{{ metaLine(work, record, rounds) }}</p>
              <div v-if="record?.status === 'doing' || record?.status === 'paused'" class="mt-0.5 flex h-3.5 items-center gap-2 text-xs leading-none text-muted">
                <div v-if="progressRatio(record.progress)" class="h-1 max-w-28 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
                  <div class="h-full rounded-full" :class="record.status === 'paused' ? 'bg-warn' : 'bg-primary'" :style="{ width: `${progressRatio(record.progress) * 100}%` }" />
                </div>
                <span class="shrink-0">{{ progressText(record.progress) }}</span>
              </div>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1.5 text-xs">
              <StatusPill :status="record?.status ?? 'todo'" />
              <RatingBadge v-if="record?.rating != null" :value="record.rating" class="leading-none" />
            </div>
          </RouterLink>
        </li>
      </ul>
    </div>
  </template>

  <!-- small covers: picture, title and progress -->
  <ul v-else class="grid grid-cols-3 gap-x-3 gap-y-4">
    <li v-for="{ work, record, rounds } in rows" :key="work.id + (record?.id ?? '')">
      <RouterLink :to="`/work/${work.id}`" class="block transition active:scale-95">
        <div class="relative">
          <WorkCover :src="work.cover" :title="work.title" class="aspect-[7/10] w-full" :class="work.cover && 'shadow-sm'" />
          <!-- one look for both labels: dark, see-through and white text reads on any cover -->
          <div class="absolute bottom-1.5 left-1.5 flex items-center gap-1">
            <span class="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white backdrop-blur-sm">{{ statusLabel(record?.status ?? 'todo') }}</span>
            <span v-if="rounds > 1 && record" class="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white backdrop-blur-sm">{{ record.round }} 刷</span>
          </div>
        </div>
        <p class="mt-1.5 line-clamp-2 text-xs leading-snug font-medium">{{ work.title }}</p>
        <div v-if="(record?.status === 'doing' || record?.status === 'paused') && progressRatio(record.progress)" class="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
          <div class="h-full rounded-full" :class="record.status === 'paused' ? 'bg-warn' : 'bg-primary'" :style="{ width: `${progressRatio(record.progress) * 100}%` }" />
        </div>
        <RatingBadge v-else-if="record?.status === 'done' && record.rating != null" :value="record.rating" class="mt-0.5 text-xs" />
      </RouterLink>
    </li>
  </ul>

  </template>

  <PopupDialog v-model="newSeriesOpen">
    <form class="card w-full max-w-[21rem] space-y-4 p-5 shadow-xl" role="dialog" aria-label="新增系列" @submit.prevent="addSeries">
      <h2 class="text-lg leading-snug font-bold">新增系列</h2>
      <input v-model="newSeriesName" class="input" placeholder="系列名稱" />
      <button type="submit" class="btn btn-primary w-full disabled:opacity-40" :disabled="!newSeriesName.trim()">新增</button>
    </form>
  </PopupDialog>

  <BottomSheet v-model="sheet" title="排序與篩選">
    <!-- the series tab: its order, and a score to filter by -->
    <div v-if="libTab === 'series' && !tagName" class="space-y-5">
      <div>
        <div class="flex items-center justify-between">
          <span class="label">排序</span>
          <!-- the way it goes: one tap turns it around -->
          <button v-if="seriesDirs[0]" class="mb-1.5 flex items-center gap-1 text-xs font-semibold text-primary" @click="settings.s.seriesDir = settings.s.seriesDir === 'down' ? 'up' : 'down'"><ArrowUpDown :size="13" />{{ seriesDirs[settings.s.seriesDir === 'down' ? 0 : 1] }}</button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button v-for="o in SERIES_SORTS" :key="o.value" class="chip" :class="settings.s.seriesSort === o.value && 'chip-on'" @click="settings.s.seriesSort = o.value">{{ o.label }}</button>
        </div>
      </div>
      <div>
        <span class="label">評分至少</span>
        <div class="flex flex-wrap gap-2">
          <template v-for="r in ratingSteps" :key="r">
            <button class="chip" :class="!sUnrated && sMinRating === r && 'chip-on'" @click="((sMinRating = r), (sUnrated = false))">{{ r ? formatScore(r) : '不限' }}</button>
            <button v-if="!r" class="chip" :class="sUnrated && 'chip-on'" @click="((sUnrated = true), (sMinRating = 0))">未評分</button>
          </template>
        </div>
      </div>
    </div>
    <div v-else class="space-y-5">
      <div v-if="!tagName">
        <div class="flex items-center justify-between">
          <span class="label">排序</span>
          <button class="mb-1.5 flex items-center gap-1 text-xs font-semibold text-primary" @click="settings.s.libraryDir = settings.s.libraryDir === 'down' ? 'up' : 'down'"><ArrowUpDown :size="13" />{{ workDirs[settings.s.libraryDir === 'down' ? 0 : 1] }}</button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button v-for="o in WORK_SORTS" :key="o.value" class="chip" :class="settings.s.librarySort === o.value && 'chip-on'" @click="settings.s.librarySort = o.value">{{ o.label }}</button>
        </div>
      </div>
      <div>
        <span class="label">年份</span>
        <div class="flex flex-wrap gap-2">
          <button class="chip" :class="!f.year && 'chip-on'" @click="f.year = ''">全部</button>
          <button v-for="y in yearChoices" :key="y" class="chip" :class="f.year === y && 'chip-on'" @click="f.year = y">{{ y }}</button>
        </div>
      </div>
      <div>
        <span class="label">狀態</span>
        <div class="flex flex-wrap gap-2">
          <button class="chip" :class="!f.statuses.length && 'chip-on'" @click="f.statuses = []">全部</button>
          <button v-for="s in STATUSES" :key="s.value" class="chip" :class="f.statuses.includes(s.value) && 'chip-on'" @click="toggle(f.statuses, s.value)">{{ s.label }}</button>
        </div>
      </div>
      <div v-if="tagChoices.length && !tagName">
        <span class="label">標籤（需全部符合）</span>
        <div class="flex flex-wrap gap-2">
          <button v-for="t in tagChoices" :key="t.id" class="chip" :class="f.tagIds.includes(t.id) && 'chip-on'" @click="toggle(f.tagIds, t.id)">{{ t.name }}</button>
        </div>
      </div>
      <div>
        <span class="label">評分至少</span>
        <div class="flex flex-wrap gap-2">
          <template v-for="r in ratingSteps" :key="r">
            <button class="chip" :class="!f.unrated && f.minRating === r && 'chip-on'" @click="((f.minRating = r), (f.unrated = false))">{{ r ? formatScore(r) : '不限' }}</button>
            <button v-if="!r" class="chip" :class="f.unrated && 'chip-on'" @click="((f.unrated = true), (f.minRating = 0))">未評分</button>
          </template>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="grid grid-cols-[auto_1fr] gap-2">
        <button class="btn btn-ghost" @click="libTab === 'series' && !tagName ? ((sMinRating = 0), (sUnrated = false)) : (f = { ...emptyFilter(), types: f.types, query: f.query })">清除</button>
        <button class="btn btn-primary" @click="sheet = false">顯示 {{ libTab === 'series' && !tagName ? seriesList.length : rows.length }} 筆</button>
      </div>
    </template>
  </BottomSheet>
</template>
