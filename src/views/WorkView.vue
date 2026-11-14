<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { Progress, ProgressLog, Rec, WorkNote } from '@/db/types'
import { earliest, formatFuzzy, formatSpan, latest, today } from '@/lib/date'
import { uid } from '@/lib/id'
import { progressLogText, progressRatio, progressText, typeLabel } from '@/lib/meta'
import { formatRating } from '@/lib/ratings'
import { useCover } from '@/lib/covers'
import { logProgress, progressLogId, put, remove, removeRecord, setProgress, startNewRound } from '@/lib/repo'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { Layers, Minus, Pencil, Plus, Star, ChevronDown } from '@/lib/uiIcons'
import FuzzyDateField from '@/components/FuzzyDateField.vue'
import PageHeader from '@/components/PageHeader.vue'
import PillTabs from '@/components/PillTabs.vue'
import RatingStars from '@/components/RatingStars.vue'
import NoteSheet from '@/components/NoteSheet.vue'
import RatingSheet from '@/components/RatingSheet.vue'
import RecordSheet from '@/components/RecordSheet.vue'
import StatusPill from '@/components/StatusPill.vue'
import WorkCover from '@/components/WorkCover.vue'
import PopupDialog from '@/components/PopupDialog.vue'

const route = useRoute()
const data = useData()
const ui = useUi()

const work = computed(() => data.workById.get(route.params.id as string))
const rounds = computed(() => data.records.filter((r) => r.workId === work.value?.id).sort((a, b) => a.round - b.round))
const roundsNewest = computed(() => [...rounds.value].reverse())
const latest_ = computed(() => rounds.value[rounds.value.length - 1])
/** the round the bottom bar and the edit sheet work on: the newest, unless a round was tapped */
const roundId = ref('')
const rec = computed(() => rounds.value.find((r) => r.id === roundId.value) ?? latest_.value)
watch(
  () => route.params.id,
  () => (roundId.value = ''),
)

const tags = computed(() => data.tags.filter((t) => work.value?.tagIds.includes(t.id)))
const series = computed(() => data.series.find((s) => s.id === work.value?.seriesId))
const coverUrl = useCover(() => work.value?.cover)

/** the header shows the score of the newest round that has one; with none yet it offers to rate the newest round */
const scored = computed(() => [...rounds.value].reverse().find((r) => r.rating != null) ?? latest_.value)

const tab = ref<'log' | 'review' | 'memo'>('log')

// ---- notes: each has a date; the round it belongs to is worked out from the dates ----
const workNotes = computed(() => data.notes.filter((n) => n.workId === work.value?.id && (n.body || n.title)))
/** the newest round that had started by the note's date and had not ended before it */
function roundOfNote(n: WorkNote): Rec | undefined {
  const day = earliest(n.date)
  const hit = [...rounds.value].reverse().find((r) => (!r.start || earliest(r.start) <= day) && (!r.end || day <= latest(r.end)))
  if (hit) return hit
  // between two rounds, or after the last one ended: the newest round that had already started by then, else the first
  return [...rounds.value].reverse().find((r) => r.start && earliest(r.start) <= day) ?? rounds.value[0]
}
/** the unit a note's progress is counted in: its round's, or the newest round's */
const noteUnit = (n: WorkNote) => (roundOfNote(n) ?? latest_.value)?.progress.unit ?? ''
/** "80%" / "80 頁" */
const noteProgress = (n: WorkNote) => (n.progress == null ? '' : noteUnit(n) === '%' ? `${n.progress}%` : `${n.progress} ${noteUnit(n)}`.trim())
const byDateDesc =<T extends { date: string; at: number }>(a: T, b: T) => (a.date === b.date ? b.at - a.at : !a.date ? 1 : !b.date ? -1 : a.date < b.date ? 1 : -1)
/** the work's 心得 and 筆記, each newest first, with the round it falls in */
const kindName = (n: WorkNote) => (n.kind === 'note' ? '筆記' : '心得')
const reviews = computed(() => workNotes.value.filter((n) => n.kind !== 'note'))
const memos = computed(() => workNotes.value.filter((n) => n.kind === 'note'))
const noteList = computed(() => (tab.value === 'memo' ? memos.value : reviews.value).map((n) => ({ note: n, round: roundOfNote(n) })).sort((a, b) => byDateDesc({ date: a.note.date, at: a.note.updatedAt }, { date: b.note.date, at: b.note.updatedAt })))
// ---- notes ----
const noteOpen = ref(false)
const noteNew = ref(false)
const noteDraft = ref<WorkNote>({ id: '', updatedAt: 0, workId: '', date: '', body: '' })
function newNote(kind?: 'note') {
  noteNew.value = true
  const here = latest_.value?.progress.current
  noteDraft.value = { id: uid(), updatedAt: Date.now(), workId: work.value!.id, date: today(), body: '', ...(kind ? { kind } : {}), ...(kind && here ? { progress: here } : {}) }
  noteOpen.value = true
}
function editNote(n: WorkNote) {
  noteNew.value = false
  noteDraft.value = n
  noteOpen.value = true
}
async function saveNote(n: WorkNote) {
  await put('notes', n)
}
async function removeNote() {
  if (await ui.confirm(`刪除這則${kindName(noteDraft.value)}？`, { danger: true, confirmText: '刪除' })) await remove('notes', noteDraft.value.id)
}

// ---- a round: dates, status, score ----
const recordOpen = ref(false)
function editRound(r: Rec) {
  roundId.value = r.id
  recordOpen.value = true
}
watch(recordOpen, (o) => {
  if (!o) roundId.value = ''
})
const ratingOpen = ref(false)
const ratingRoundId = ref('')
const ratingDraft = computed<number | null>({
  get: () => rounds.value.find((r) => r.id === ratingRoundId.value)?.rating ?? null,
  set: (v) => {
    const r = rounds.value.find((r) => r.id === ratingRoundId.value)
    if (r) void put('records', JSON.parse(JSON.stringify({ ...r, rating: v })))
  },
})
function rate(id: string) {
  ratingRoundId.value = id
  ratingOpen.value = true
}

// ---- progress: only where the round stands now ----
/** set the progress up or down; a finished round that no longer reaches the end goes back to 在看 */
async function changeProgress(r: Rec, value: number) {
  const next = await setProgress(r, value)
  const p = next.progress
  if (next.status === 'done' && !p.infinite && p.total > 0 && value < p.total) {
    await put('records', { ...next, status: 'doing', end: '' })
    ui.toast('進度未滿，已改回「在看」', 'info')
  }
}
const topOf = (p: Progress) => (!p.infinite && p.total > 0 ? p.total : Infinity)
async function nudge(n: number) {
  const r = latest_.value
  if (!r) return
  const next = Math.min(topOf(r.progress), Math.max(0, r.progress.current + n))
  if (next !== r.progress.current) await changeProgress(r, next)
}
/** older rounds show how far they got, unless they were finished */
const showsProgress = (r: { id: string; status: string }) => r.id !== latest_.value?.id && r.status !== 'done'
const progressOpen = ref(false)
const drawerValue = ref(0)
/** the sheet never shows a number above the total: typing past it snaps back to it */
function setDrawer(v: number, input?: HTMLInputElement) {
  const top = latest_.value ? topOf(latest_.value.progress) : Infinity
  drawerValue.value = Math.min(top, Math.max(0, v))
  if (input) input.value = String(drawerValue.value)
}
watch(progressOpen, (o) => {
  if (o) drawerValue.value = latest_.value?.progress.current ?? 0
})
async function saveDrawer() {
  const r = latest_.value
  if (!r) return
  progressOpen.value = false
  const value = Math.min(topOf(r.progress), Math.max(0, drawerValue.value))
  if (value !== r.progress.current) await changeProgress(r, value)
}

// ---- another round ----
/** a new round starts right away; the earlier rounds are left as they are, the user changes their status when they want */
async function startRound() {
  const r = latest_.value
  if (!r) return
  const next = await startNewRound(r, work.value)
  ui.toast(`開始 ${next.round} 刷`, 'success')
}
async function removeRound() {
  const r = rec.value
  if (!r || !(await ui.confirm('刪除這一刷？', { message: '心得會保留在作品裡。', danger: true, confirmText: '刪除' }))) return
  await removeRecord(r.id)
}

// ---- day by day: where the round got to on each day ----
type FeedItem =
  | { key: string; kind: 'start' | 'end'; date: string; round: Rec; rank: number }
  | { key: string; kind: 'day'; date: string; round: Rec; rank: number; log: ProgressLog }
  | { key: string; kind: 'note'; date: string; round?: Rec; rank: number; note: WorkNote }
/** everything about the work in one list, newest first: starts, finishes, the days, notes and reviews */
const feed = computed<FeedItem[]>(() => {
  const out: FeedItem[] = []
  for (const r of rounds.value) {
    if (r.start) out.push({ key: `s-${r.id}`, kind: 'start', date: r.start, round: r, rank: 1 })
    if (r.end) out.push({ key: `e-${r.id}`, kind: 'end', date: r.end, round: r, rank: 4 })
  }
  for (const l of data.progressLogs) {
    const round = rounds.value.find((r) => r.id === l.recordId)
    if (round && l.workId === work.value?.id) out.push({ key: l.id, kind: 'day', date: l.date, round, rank: 3, log: l })
  }
  for (const n of workNotes.value) out.push({ key: n.id, kind: 'note', date: n.date, round: roundOfNote(n), rank: 2, note: n })
  const day = (x: FeedItem) => latest(x.date) || ''
  return out.sort((a, b) => (day(a) === day(b) ? (b.round?.round ?? 0) - (a.round?.round ?? 0) || b.rank - a.rank : day(a) < day(b) ? 1 : -1))
})
/** with several rounds the list is folded into one section per round, newest first; the older ones start closed */
const feedGroups = computed(() => {
  if (rounds.value.length <= 1) return [{ key: '', label: '', items: feed.value }]
  const groups = roundsNewest.value.map((r) => ({ key: r.id, label: `${r.round} 刷`, items: feed.value.filter((x) => x.round?.id === r.id) }))
  const loose = feed.value.filter((x) => !x.round)
  if (loose.length) groups.push({ key: 'loose', label: '其他', items: loose })
  return groups.filter((g) => g.items.length)
})
const closedGroups = ref<Record<string, boolean>>({})
const isClosed = (key: string) => !!key && (closedGroups.value[key] ?? key !== latest_.value?.id)
function toggleGroup(key: string) {
  closedGroups.value = { ...closedGroups.value, [key]: !isClosed(key) }
}
/** long notes and reviews show five lines: tap the text to open the rest, tap again to fold it (a short one just opens for editing) */
const openBodies = ref<Record<string, boolean>>({})
function tapBody(e: MouseEvent, key: string) {
  const el = e.currentTarget as HTMLElement
  if (!openBodies.value[key] && el.scrollHeight <= el.clientHeight + 1) return
  e.stopPropagation()
  openBodies.value = { ...openBodies.value, [key]: !openBodies.value[key] }
}
function openFeed(x: FeedItem) {
  if (x.kind === 'note') editNote(x.note)
  else if (x.kind === 'day') editDay(x.round, x.log)
  else editRound(x.round)
}
const dayOpen = ref(false)
const dayRec = ref<Rec>()
const dayDate = ref('')
const dayValue = ref(0)
/** '' = the start of the day is not known */
const dayFrom = ref('')
/** the entry being edited; '' when adding one for a day that has none yet */
const dayLogId = ref('')
function addDay(r: Rec) {
  dayRec.value = r
  dayLogId.value = ''
  dayDate.value = today()
  dayValue.value = r.progress.current
  dayFrom.value = ''
  dayOpen.value = true
}
function editDay(r: Rec, l: ProgressLog) {
  dayRec.value = r
  dayLogId.value = l.id
  dayDate.value = l.date
  dayValue.value = l.value
  dayFrom.value = l.from != null ? String(l.from) : ''
  dayOpen.value = true
}
const dayError = computed(() => {
  const r = dayRec.value
  if (!r) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDate.value)) return '請選擇日期'
  if (dayDate.value > today()) return '不能記未來的日期'
  if (dayFrom.value !== '' && Number(dayFrom.value) > dayValue.value) return '起點不能大於看到的進度'
  if (!r.progress.infinite && r.progress.total > 0 && dayValue.value > r.progress.total) return `不能超過總進度 ${r.progress.total}`
  return ''
})
async function saveDay() {
  const r = dayRec.value
  if (!r || dayError.value) return
  // moving an entry to another day: the old one goes away (the new day's entry, if any, is replaced)
  if (dayLogId.value && dayLogId.value !== progressLogId(r.id, dayDate.value)) await remove('progressLogs', dayLogId.value)
  await logProgress(r, dayValue.value, dayDate.value, dayFrom.value === '' ? undefined : Number(dayFrom.value))
  // the round stands where its latest day says: an entry on (or after) the newest day moves the current progress too
  const newest = data.progressLogs.every((l) => l.recordId !== r.id || l.id === progressLogId(r.id, dayDate.value) || l.date <= dayDate.value)
  if (newest && dayValue.value !== r.progress.current) {
    const v = dayValue.value
    const p = r.progress
    const reachedEnd = !p.infinite && p.total > 0 && v >= p.total
    const status = reachedEnd ? 'done' : r.status === 'done' && !p.infinite && p.total > 0 ? 'doing' : r.status === 'todo' && v > 0 ? 'doing' : r.status
    await put('records', { ...r, progress: { ...p, current: v }, status, end: status === 'done' ? r.end || dayDate.value : status === 'doing' && r.status === 'done' ? '' : r.end, start: status !== 'todo' ? r.start || dayDate.value : r.start, updatedAt: Date.now() })
  }
  dayOpen.value = false
}
async function removeDay() {
  if (dayLogId.value && (await ui.confirm('刪除這天的記錄？', { message: '只刪除這一天的紀錄，不會改變目前進度。', danger: true, confirmText: '刪除' }))) {
    await remove('progressLogs', dayLogId.value)
    dayOpen.value = false
  }
}
</script>

<template>
  <div v-if="work" class="flex min-h-[calc(100dvh-var(--page-pt)-2.5rem-env(safe-area-inset-bottom))] flex-col">
    <div class="relative isolate">
    <!-- the cover, enlarged and blurred, fading into the page background -->
    <div v-if="coverUrl" class="pointer-events-none absolute -inset-x-4 -top-24 bottom-14 -z-10 overflow-hidden" aria-hidden="true">
      <img :src="coverUrl" class="size-full scale-125 object-cover opacity-70 blur-2xl" alt="" referrerpolicy="no-referrer" />
      <div class="absolute inset-0 bg-gradient-to-b from-bg/10 via-bg/30 to-bg" />
    </div>
    <PageHeader :title="''" class="!bg-transparent">
      <template #right>
        <RouterLink v-if="series" :to="`/series/${series.id}`" class="circle-btn" :aria-label="`系列：${series.name}`"><Layers :size="19" /></RouterLink>
        <RouterLink :to="`/work/${work.id}/edit`" class="circle-btn" aria-label="編輯作品"><Pencil :size="19" /></RouterLink>
      </template>
    </PageHeader>

    <div class="mb-4 flex gap-4">
      <WorkCover :src="work.cover" :title="work.title" class="h-40 w-28 shrink-0 shadow-sm" />
      <div class="min-w-0 flex-1 self-end">
        <p class="mb-0.5 text-xs font-semibold text-muted">{{ typeLabel(work.type) }}</p>
        <h1 class="text-lg leading-snug font-bold">{{ work.title }}</h1>
        <p v-if="work.creators" class="mt-0.5 text-xs text-muted">{{ work.creators }}</p>
        <button v-if="scored" class="mt-1 flex items-center gap-1.5 text-sm font-semibold" :class="scored.rating == null && 'text-xs font-normal text-muted'" @click="rate(scored.id)"><RatingStars :value="scored.rating" :size="14" />{{ scored.rating == null ? '點此評分' : formatRating(scored.rating) }}</button>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <RouterLink v-for="t in tags" :key="t.id" :to="{ path: '/', query: { tag: t.id, type: work.type } }" class="tag">{{ t.name }}</RouterLink>
        </div>
      </div>
    </div>

    <PillTabs v-model="tab" size="sm" class="mb-4" :options="[{ value: 'log', label: '記錄' }, { value: 'review', label: reviews.length ? `心得（${reviews.length}）` : '心得' }, { value: 'memo', label: memos.length ? `筆記（${memos.length}）` : '筆記' }]" />
    </div>

    <template v-if="rec && tab === 'log'">
      <!-- one card per round: tap it to change its dates, status or score -->
      <div class="mb-2 flex items-center justify-between px-1 text-xs text-muted">
        <span class="text-sm font-semibold">進度</span>
        <button class="flex items-center gap-1" @click="startRound()"><Plus :size="13" />新增</button>
      </div>
      <ul class="space-y-3">
        <li v-for="r in roundsNewest" :key="r.id">
          <div class="card">
            <button class="flex w-full items-center gap-3 text-left" @click="editRound(r)">
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span v-if="rounds.length > 1" class="text-sm font-medium">{{ r.round }} 刷</span>
                  <StatusPill :status="r.status" />
                  <span v-if="r.rating != null && showsProgress(r)" class="ml-auto flex shrink-0 items-center gap-1 font-semibold text-warn"><Star :size="14" :stroke-width="0" fill="currentColor" />{{ formatRating(r.rating) }}</span>
                </span>
                <span class="mt-2 flex items-baseline justify-between gap-3 text-xs text-muted">
                  <span>{{ formatFuzzy(r.start, '未填開始') }} → {{ formatFuzzy(r.end, '進行中') }}<template v-if="r.end && formatSpan(r.start, r.end)">（{{ formatSpan(r.start, r.end) }}）</template></span>
                  <span v-if="showsProgress(r)" class="shrink-0 font-semibold">{{ progressText(r.progress) }}</span>
                </span>
              </span>
              <!-- no progress on the right: the score sits centred between the two lines -->
              <span v-if="r.rating != null && !showsProgress(r)" class="flex shrink-0 items-center gap-1 font-semibold text-warn"><Star :size="14" :stroke-width="0" fill="currentColor" />{{ formatRating(r.rating) }}</span>
            </button>
            <!-- progress sits inside the round it belongs to: - / + change it right away, tapping the number types one in -->
            <div v-if="r.id === latest_?.id" class="-mb-1.5 flex items-center gap-3">
              <button class="shrink-0 text-sm font-semibold" @click="progressOpen = true">{{ progressText(r.progress) }}</button>
              <button class="flex min-w-0 flex-1 items-center self-stretch py-2.5" aria-label="輸入進度" @click="progressOpen = true"><span class="h-1.5 w-full overflow-hidden rounded-full bg-line"><span class="block h-full bg-primary" :style="{ width: `${progressRatio(r.progress) * 100}%` }" /></span></button>
              <button class="icon-btn size-9 border-0 disabled:opacity-30" :disabled="r.progress.current <= 0" aria-label="減一" @click="nudge(-1)"><Minus :size="16" /></button>
              <button class="icon-btn size-9 border-0 disabled:opacity-30" :disabled="r.progress.current >= topOf(r.progress)" aria-label="加一" @click="nudge(1)"><Plus :size="16" /></button>
            </div>
          </div>
        </li>
      </ul>

      <!-- everything in one list, newest first: tap a line to edit it -->
      <div class="mt-5 mb-2 flex items-center justify-between px-1 text-xs text-muted">
        <span class="text-sm font-semibold">時間軸</span>
        <button class="flex items-center gap-1" @click="addDay(latest_!)"><Plus :size="13" />補記</button>
      </div>
      <div v-for="g in feedGroups" :key="g.key" class="last:mb-0" :class="isClosed(g.key) ? 'mb-0' : 'mb-3'">
        <button v-if="g.label" class="flex w-full items-center gap-1 px-1 py-1.5 text-sm font-medium text-muted" :aria-expanded="!isClosed(g.key)" @click="toggleGroup(g.key)">
          {{ g.label }}
          <ChevronDown :size="16" class="text-muted transition-transform" :class="isClosed(g.key) && '-rotate-90'" />
        </button>
        <ul v-show="!isClosed(g.key)" class="space-y-2">
          <li v-for="x in g.items" :key="x.key">
            <button class="card w-full text-left" @click="openFeed(x)">
              <span class="flex items-center gap-2 text-xs text-muted">
                <span>{{ formatFuzzy(x.date) }}</span>
                <span v-if="x.kind === 'note'" class="ml-auto flex items-center gap-2">
                  <template v-if="x.note.progress != null">
                    <span>{{ noteProgress(x.note) }}</span>
                    <span class="h-3 w-px bg-line" />
                  </template>
                  <span>{{ x.note.kind === 'note' ? '筆記' : '心得' }}</span>
                </span>
              </span>
              <span class="mt-1.5 block font-medium">
                <template v-if="x.kind === 'start'">開始</template>
                <template v-else-if="x.kind === 'end'">完成<span v-if="formatSpan(x.round.start, x.round.end)" class="font-normal text-muted">（{{ formatSpan(x.round.start, x.round.end) }}）</span></template>
                <template v-else-if="x.kind === 'day'">{{ progressLogText(x.log, x.round.progress.unit) }}</template>
                <template v-else-if="x.kind === 'note'"><span v-if="x.note.title">{{ x.note.title }}</span><span v-else class="font-normal text-muted">無標題</span></template>
              </span>
              <span v-if="x.kind === 'note' && x.note.body" class="block whitespace-pre-wrap" :class="[x.note.title ? 'mt-1' : 'mt-0', x.note.kind === 'note' ? 'text-sm leading-6' : 'leading-7', !openBodies[x.key] && 'line-clamp-5']" @click="tapBody($event, x.key)">{{ x.note.body }}</span>
            </button>
          </li>
        </ul>
      </div>
      <div v-if="!feed.length" class="py-8 text-center">
        <p class="text-sm font-semibold text-muted">還沒有記錄</p>
        <p class="mt-1.5 text-xs leading-5 text-muted">調整進度時，會自動記下當天看到哪</p>
      </div>
    </template>

    <!-- 心得 and 筆記 each have their own page -->
    <template v-else-if="tab !== 'log'">
      <div class="mb-3 flex justify-end px-1 text-xs text-muted">
        <button class="flex items-center gap-1" @click="newNote(tab === 'memo' ? 'note' : undefined)"><Plus :size="13" />{{ tab === 'memo' ? '寫筆記' : '寫心得' }}</button>
      </div>
      <p v-if="!noteList.length" class="py-16 text-center text-sm text-muted">{{ tab === 'memo' ? '還沒有筆記，看到哪、想到什麼都可以隨手記。' : '還沒有心得，想到什麼都可以隨時寫。' }}</p>
      <ul class="space-y-3">
        <li v-for="n in noteList" :key="n.note.id">
          <button class="card w-full text-left" @click="editNote(n.note)">
            <div class="flex items-center gap-2 text-xs text-muted">
              <span v-if="n.round && rounds.length > 1" class="rounded-full bg-surface-2 px-2 py-0.5 font-medium">{{ n.round.round }} 刷</span>
              <span>{{ formatFuzzy(n.note.date) }}</span>
              <span v-if="n.note.progress != null" class="ml-auto">{{ noteProgress(n.note) }}</span>
            </div>
            <p class="mt-1.5 font-medium" :class="!n.note.title && 'font-normal text-muted'">{{ n.note.title || '無標題' }}</p>
            <p class="text-sm leading-6 whitespace-pre-wrap" :class="[n.note.title ? 'mt-1' : 'mt-0',!openBodies[n.note.id] && 'line-clamp-5']" @click="tapBody($event, n.note.id)">{{ n.note.body }}</p>
          </button>
        </li>
      </ul>
    </template>

    <PopupDialog v-model="progressOpen">
      <form v-if="latest_" class="card w-full max-w-[21rem] space-y-4 p-5 shadow-xl" role="dialog" aria-label="進度" @submit.prevent="saveDrawer">
        <h2 class="text-lg leading-snug font-bold">進度<template v-if="!latest_.progress.infinite && latest_.progress.total > 0">（共 {{ latest_.progress.total }} {{ latest_.progress.unit }}）</template></h2>
        <div class="relative">
          <button type="button" class="icon-btn absolute top-1/2 left-1 -translate-y-1/2 border-0 bg-transparent disabled:opacity-30" aria-label="減一" :disabled="drawerValue <= 0" @click="drawerValue--"><Minus :size="18" /></button>
          <input class="input w-full px-12 text-center" inputmode="numeric" :value="drawerValue" @input="setDrawer(Number(($event.target as HTMLInputElement).value.replace(/\D/g, '')) || 0, $event.target as HTMLInputElement)" />
          <button type="button" class="icon-btn absolute top-1/2 right-1 -translate-y-1/2 border-0 bg-transparent disabled:opacity-30" aria-label="加一" :disabled="!!latest_ && drawerValue >= topOf(latest_.progress)" @click="setDrawer(drawerValue + 1)"><Plus :size="18" /></button>
        </div>
        <div class="grid grid-cols-[auto_1fr] gap-2">
          <button type="button" class="btn btn-ghost px-5 disabled:opacity-40" :disabled="drawerValue === latest_.progress.current" @click="drawerValue = latest_.progress.current">重置</button>
          <button type="submit" class="btn btn-primary disabled:opacity-40" :disabled="drawerValue === latest_.progress.current">儲存</button>
        </div>
      </form>
    </PopupDialog>

    <PopupDialog v-model="dayOpen">
      <form v-if="dayRec" class="card w-full max-w-[21rem] space-y-4 p-5 shadow-xl" role="dialog" aria-label="每日進度" @submit.prevent="saveDay">
        <h2 class="text-lg leading-snug font-bold">{{ dayLogId ? '編輯這天' : '補記一天' }}</h2>
        <FuzzyDateField v-model="dayDate" label="日期" day-only :max="today()" />
        <label class="block">
          <span class="label">從哪開始（選填）</span>
          <input class="input text-center" inputmode="numeric" placeholder="不確定就留空，只記看到哪" :value="dayFrom" @input="dayFrom = ($event.target as HTMLInputElement).value.replace(/\D/g, '')" />
        </label>
        <div>
          <span class="label">看到（{{ dayRec.progress.unit }}）</span>
          <div class="relative">
            <button type="button" class="icon-btn absolute top-1/2 left-1 -translate-y-1/2 border-0 bg-transparent disabled:opacity-30" aria-label="減一" :disabled="dayValue <= 0" @click="dayValue--"><Minus :size="18" /></button>
            <input class="input w-full px-12 text-center" inputmode="numeric" :value="dayValue" @input="dayValue = Number(($event.target as HTMLInputElement).value.replace(/\D/g, '')) || 0" />
            <button type="button" class="icon-btn absolute top-1/2 right-1 -translate-y-1/2 border-0 bg-transparent" aria-label="加一" @click="dayValue++"><Plus :size="18" /></button>
          </div>
          <p v-if="dayError" class="mt-1.5 text-sm text-danger">{{ dayError }}</p>
        </div>
        <div class="flex gap-2">
          <button v-if="dayLogId" type="button" class="btn btn-ghost shrink-0 px-3.5 text-sm text-danger" @click="removeDay">刪除</button>
          <button type="submit" class="btn btn-primary min-w-0 flex-1 disabled:opacity-40" :disabled="!!dayError">儲存</button>
        </div>
      </form>
    </PopupDialog>

    <NoteSheet v-model:open="noteOpen" :note="noteDraft" :unit="noteUnit(noteDraft)" :is-new="noteNew" @save="saveNote" @remove="removeNote" />
    <RatingSheet v-model:open="ratingOpen" v-model="ratingDraft" />
    <RecordSheet v-if="rec" v-model:open="recordOpen" :record="rec" :removable="rounds.length > 1" @remove="removeRound" />
  </div>
  <p v-else-if="data.ready" class="py-16 text-center text-muted">找不到這個作品</p>
</template>
