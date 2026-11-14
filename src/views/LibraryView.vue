<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { emptyFilter, filterCount, matches, yearsOf } from '@/lib/filter'
import { earliest, today } from '@/lib/date'
import type { Rec, Work, WorkType } from '@/db/types'
import { progressRatio, progressText, statusLabel, STATUSES, allTypes, typeLabel, workTypes } from '@/lib/meta'
import { formatRating, formatScore, mergeRatings } from '@/lib/ratings'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useSync } from '@/stores/sync'
import { useRouter } from 'vue-router'
import { loadDemo } from '@/lib/demo'
import { useUi } from '@/stores/ui'
import { GalleryVerticalEnd, ChevronDown, ChevronLeft, Cloud, Filter, LoaderCircle, LayoutGrid, List, Plus, Search, Star } from '@/lib/uiIcons'
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
const yearChoices = computed(() => {
  const all = new Set<string>([thisYear])
  for (const r of data.records) for (const y of yearsOf([r], thisYear)) all.add(y)
  return [...all].sort().reverse()
})
const rows = computed(() => allRows.value.filter((x) => matches(x, f.value, data.categories, yearsOf(x.record ? [x.record] : [], thisYear))))
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
const timeline = computed(() => {
  const keyOf = (r?: Rec) => {
    const d = r?.end || r?.start || ''
    return d ? (d.length <= 4 ? d : d.slice(0, 7)) : ''
  }
  const dated = rows.value
    .map((x) => ({ ...x, key: keyOf(x.record) }))
    .sort((a, b) => (a.key === b.key ? 0 : !a.key ? 1 : !b.key ? -1 : a.key < b.key ? 1 : -1))
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
    <button v-if="route.query.tag" class="absolute left-4 inline-flex size-10 items-center justify-center text-muted transition active:scale-90" aria-label="返回" @click="router.back()"><ChevronLeft :size="24" /></button>
    <button v-else class="absolute left-4 inline-flex size-10 items-center justify-center text-muted transition active:scale-90" :aria-label="syncInfo.text" :title="syncInfo.text" @click="syncTap">
      <LoaderCircle v-if="sync.status === 'syncing'" :size="22" class="animate-spin" />
      <Cloud v-else :size="22" />
      <span v-if="syncInfo.dot" class="absolute top-2 right-1.5 size-2 rounded-full ring-2 ring-bg" :class="syncInfo.dot" />
    </button>
    <h1 v-if="tagName" class="max-w-[60%] truncate text-xl font-bold">{{ tagName }}</h1>
    <button v-else class="relative text-xl font-bold" aria-label="選擇作品類型" @click="typeOpen = true">{{ typeTitle }}<ChevronDown :size="18" class="absolute top-1/2 left-full ml-1 -translate-y-1/2 text-muted" /></button>
    <RouterLink to="/work/new" class="absolute right-4 inline-flex size-10 items-center justify-center text-ink transition active:scale-90" aria-label="新增作品" title="新增作品"><Plus :size="24" /></RouterLink>
    <PickSheet v-model:open="typeOpen" :model-value="typeValue" title="作品類型" :items="typeItems" @pick="pickType" />
  </header>

  <div class="mb-4 flex gap-2">
    <label class="input flex min-w-0 items-center gap-2">
      <Search :size="18" class="shrink-0 text-muted" />
      <input v-model="f.query" class="min-w-0 flex-1 bg-transparent outline-none" placeholder="搜尋標題、作者" />
    </label>
    <button v-if="!tagName" class="icon-btn size-12 shrink-0 rounded-2xl" :aria-label="NEXT_LABEL[view]" @click="settings.s.libraryView = NEXT[view]">
      <LayoutGrid v-if="view === 'timeline'" :size="18" />
      <List v-else :size="18" />
    </button>
    <button v-if="!tagName" class="icon-btn relative size-12 shrink-0 rounded-2xl" aria-label="篩選" @click="sheet = true">
      <Filter :size="18" />
      <span v-if="active" class="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-primary text-xs font-bold text-white">{{ active }}</span>
    </button>
  </div>

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
  <p v-else-if="data.ready && !rows.length" class="grid min-h-[45dvh] place-items-center pt-6 text-center text-sm text-muted">沒有符合的作品</p>

  <!-- a tag's page: just the works, one row each, with the best rating -->
  <ul v-if="tagName" class="space-y-2.5">
    <li v-for="{ work: w, rating } in tagWorks" :key="w.id">
      <RouterLink :to="`/work/${w.id}`" class="card flex h-[72px] items-center gap-3 overflow-hidden px-3">
        <WorkCover :src="w.cover" :title="w.title" :icon-size="13" class="h-[52px] w-[37px] shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm leading-tight font-medium">{{ w.title }}</p>
          <p v-if="w.creators" class="mt-px truncate text-xs leading-tight text-muted">{{ w.creators }}</p>
        </div>
        <p v-if="rating != null" class="flex shrink-0 items-center gap-1 text-xs leading-none font-semibold text-warn"><Star :size="11" :stroke-width="0" fill="currentColor" />{{ formatRating(rating) }}</p>
      </RouterLink>
    </li>
  </ul>

  <!-- timeline: grouped by month, each card says on which day; rounds in progress show their progress bar -->
  <template v-else-if="view === 'timeline'">
    <div v-for="g in timeline" :key="g.month" class="mb-5">
      <h2 class="section-title">{{ g.month ? monthTitle(g.month) : '未填日期' }}</h2>
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
              <p v-if="record?.rating != null" class="flex items-center gap-1 leading-none font-semibold text-warn"><Star :size="11" :stroke-width="0" fill="currentColor" />{{ formatRating(record.rating) }}</p>
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
        <p v-else-if="record?.status === 'done' && record.rating != null" class="mt-0.5 flex items-center gap-1 text-xs font-semibold text-warn"><Star :size="11" :stroke-width="0" fill="currentColor" />{{ formatRating(record.rating) }}</p>
      </RouterLink>
    </li>
  </ul>

  <BottomSheet v-model="sheet" title="篩選">
    <div class="space-y-5">
      <div>
        <span class="label">年份</span>
        <div class="flex flex-wrap gap-2">
          <button class="chip" :class="!f.year && 'chip-on'" @click="f.year = ''">全部年份</button>
          <button v-for="y in yearChoices" :key="y" class="chip" :class="f.year === y && 'chip-on'" @click="f.year = y">{{ y }}</button>
        </div>
      </div>
      <div>
        <span class="label">狀態</span>
        <div class="flex flex-wrap gap-2">
          <button class="chip" :class="!f.statuses.length && 'chip-on'" @click="f.statuses = []">全部狀態</button>
          <button v-for="s in STATUSES" :key="s.value" class="chip" :class="f.statuses.includes(s.value) && 'chip-on'" @click="toggle(f.statuses, s.value)">{{ s.label }}</button>
        </div>
      </div>
      <div v-if="data.tags.length && !tagName">
        <span class="label">標籤（需全部符合）</span>
        <div class="flex flex-wrap gap-2">
          <button v-for="t in data.tags" :key="t.id" class="chip" :class="f.tagIds.includes(t.id) && 'chip-on'" @click="toggle(f.tagIds, t.id)">{{ t.name }}</button>
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
        <button class="btn btn-ghost" @click="f = { ...emptyFilter(), types: f.types, query: f.query }">清除</button>
        <button class="btn btn-primary" @click="sheet = false">顯示 {{ rows.length }} 筆</button>
      </div>
    </template>
  </BottomSheet>
</template>
