<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useData } from '@/stores/data'
import { useCover } from '@/lib/covers'
import { fileToCover } from '@/lib/image'
import { useUi } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { createTag, put, removeSeries } from '@/lib/repo'
import NamePickSheet from '@/components/NamePickSheet.vue'
import { statusLabel } from '@/lib/meta'
import { formatFuzzy, today } from '@/lib/date'
import { uid } from '@/lib/id'
import type { SeriesReview, Work, WorkNote } from '@/db/types'
import { formatRating } from '@/lib/ratings'
import RatingStars from '@/components/RatingStars.vue'
import RatingSheet from '@/components/RatingSheet.vue'
import PillTabs from '@/components/PillTabs.vue'
import NoteSheet from '@/components/NoteSheet.vue'
import { ChevronDown, LayoutGrid, List, Pencil, Plus } from '@/lib/uiIcons'
import RatingBadge from '@/components/RatingBadge.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusPill from '@/components/StatusPill.vue'
import WorkCover from '@/components/WorkCover.vue'

const route = useRoute()
const router = useRouter()
const data = useData()
const ui = useUi()
const settings = useSettings()
/** list ⇄ covers only; the button shows the layout it switches to */
const view = computed(() => (settings.s.seriesView === 'grid' ? 'grid' : 'list'))
const series = computed(() => data.series.find((s) => s.id === route.params.id))
/** a work's score, as on its own page: the newest round that has one (a rewatch in progress keeps the earlier score) */
const scoreOf = computed(() => {
  const m = new Map<string, number>()
  for (const r of [...data.records].sort((a, b) => a.round - b.round)) if (!r.deleted && r.rating != null) m.set(r.workId, r.rating)
  return m
})
const items = computed(() =>
  data.works
    .filter((w) => w.seriesId === series.value?.id)
    // a work that was never placed goes to the end
    .sort((a, b) => (a.seriesOrder ?? 1e9) - (b.seriesOrder ?? 1e9) || a.title.localeCompare(b.title))
    .map((work) => ({ work, record: data.latestRecord.get(work.id) })),
)

// press and hold a work to pick it up: it then follows the finger while the others slide out of the way.
// The order is saved when you let go.
const dragList = ref<typeof items.value | null>(null)
const dragging = ref('')
/** the work that is sliding back into its place after a drop */
const settling = ref('')
/** how far the picked-up work is from its own place, so it stays under the finger */
const offset = ref({ x: 0, y: 0 })
const shown = computed(() => dragList.value ?? items.value)
const box = ref<{ $el: HTMLElement }>()
const HOLD_MS = 350
const SLOP = 8
let timer = 0
let startX = 0
let startY = 0
let lastX = 0
let lastY = 0
/** where on the work the finger took hold of it */
let grab = { x: 0, y: 0 }
/** a drag that just ended must not also open the work */
let swallow = false

const listEl = () => box.value?.$el
const liOf = (id: string) => listEl()?.querySelector<HTMLElement>(`[data-id="${id}"]`)
/** the finger's position inside the list (the works' offsetLeft / offsetTop are measured the same way, free of any movement) */
function inList(x: number, y: number) {
  const r = listEl()!.getBoundingClientRect()
  return { x: x - r.left, y: y - r.top }
}
function place() {
  const li = liOf(dragging.value)
  if (!li) return
  const p = inList(lastX, lastY)
  offset.value = { x: p.x - grab.x - li.offsetLeft, y: p.y - grab.y - li.offsetTop }
}

function press(e: PointerEvent, id: string) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  startX = lastX = e.clientX
  startY = lastY = e.clientY
  const el = e.currentTarget as HTMLElement
  const pointer = e.pointerId
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = 0
    const p = inList(lastX, lastY)
    grab = { x: p.x - el.offsetLeft, y: p.y - el.offsetTop }
    offset.value = { x: 0, y: 0 }
    settling.value = ''
    dragList.value = [...items.value]
    dragging.value = id
    swallow = true
    try {
      el.setPointerCapture(pointer)
    } catch {
      /* the drag still works while the finger stays on the work */
    }
    navigator.vibrate?.(15)
  }, HOLD_MS)
}
async function move(e: PointerEvent) {
  lastX = e.clientX
  lastY = e.clientY
  if (!dragging.value) {
    // moving before the hold is over means scrolling, not dragging
    if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > SLOP) {
      clearTimeout(timer)
      timer = 0
    }
    return
  }
  const cur = dragList.value
  if (!cur || !box.value) return
  place()
  const els = Array.from(listEl()!.children) as HTMLElement[]
  const from = cur.findIndex((x) => x.work.id === dragging.value)
  // the place under the finger, by where the works sit in the layout (works in a list and in the covers grid)
  const p = inList(e.clientX, e.clientY)
  const at = els.findIndex((el) => p.x >= el.offsetLeft && p.x <= el.offsetLeft + el.offsetWidth && p.y >= el.offsetTop && p.y <= el.offsetTop + el.offsetHeight)
  if (at < 0 || at === from) return
  const next = [...cur]
  const [me] = next.splice(from, 1)
  next.splice(at, 0, me!)
  dragList.value = next
  // its place has changed: keep it under the finger
  await nextTick()
  place()
}
async function release() {
  clearTimeout(timer)
  timer = 0
  const id = dragging.value
  const next = dragList.value
  if (!id || !next) return
  // let go: it slides into its place, and the list stays as shown until the new order is stored (no flicker back)
  dragging.value = ''
  settling.value = id
  setTimeout(() => {
    if (settling.value === id) settling.value = ''
  }, 250)
  setTimeout(() => (swallow = false), 300)
  if (!next.every((x, i) => x.work.id === items.value[i]?.work.id)) {
    // the rows are reactive proxies, which IndexedDB cannot store: copy them into plain data first
    for (const [i, x] of next.entries()) if (x.work.seriesOrder !== i) await put('works', { ...(JSON.parse(JSON.stringify(x.work)) as typeof x.work), seriesOrder: i })
  }
  dragList.value = null
}
/** once a work is picked up the page must not scroll under the finger */
function onTouchMove(e: TouchEvent) {
  if (dragging.value && e.cancelable) e.preventDefault()
}
function swallowClick(e: MouseEvent) {
  if (!swallow) return
  e.preventDefault()
  e.stopPropagation()
}

/** the series' own cover, else the first work's (first with a cover) */
const coverSrc = computed(() => series.value?.cover || items.value.find((x) => x.work.cover)?.work.cover)
const coverUrl = useCover(() => coverSrc.value)

/** series tags: every work in the series carries them too */
const tagsOpen = ref(false)
/** picking a tag changes how much each tag is used, which would reshuffle the list under the finger: keep the order it had when the sheet opened */
const frozenOrder = ref<string[]>([])
watch(tagsOpen, (o) => {
  if (o) frozenOrder.value = data.tagsByUse.map((t) => t.id)
})
const tagItems = computed(() => {
  const rank = new Map(frozenOrder.value.map((id, i) => [id, i]))
  const list = tagsOpen.value ? [...data.tags].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9)) : data.tagsByUse
  return list.map((t) => ({ id: t.id, name: t.name }))
})
const tagsModel = computed<string[]>({
  get: () => series.value?.tagIds ?? [],
  set: (v) => {
    if (series.value) void put('series', JSON.parse(JSON.stringify({ ...series.value, tagIds: v })))
  },
})
const tagNames = computed(() => tagsModel.value.map((id) => data.tags.find((t) => t.id === id)?.name).filter(Boolean) as string[])

/** the pencil opens one small dialog for the name and for deleting the series */
const editOpen = ref(false)
const nameDraft = ref('')
/** the picked cover (what the page shows now when the dialog opens) */
const coverDraft = ref('')
/** the default: the first work that has a cover */
const defaultCover = computed(() => items.value.find((x) => x.work.cover)?.work.cover)
/** each distinct cover among the series' works, in their order, then a picture of the user's own */
const coverChoices = computed(() => {
  const seen = new Set<string>()
  const list = items.value.flatMap((x) => (x.work.cover && !seen.has(x.work.cover) ? (seen.add(x.work.cover), [{ id: x.work.id, title: x.work.title, cover: x.work.cover }]) : []))
  if (coverDraft.value && !seen.has(coverDraft.value)) list.push({ id: 'own', title: '自選圖片', cover: coverDraft.value })
  return list
})
const coverFile = ref<HTMLInputElement>()
async function pickCover(e: Event) {
  const el = e.target as HTMLInputElement
  const f = el.files?.[0]
  el.value = ''
  if (!f) return
  try {
    coverDraft.value = await fileToCover(f)
  } catch {
    ui.toast('無法讀取這張圖片')
  }
}
function edit() {
  nameDraft.value = series.value?.name ?? ''
  coverDraft.value = coverSrc.value ?? ''
  editOpen.value = true
}
async function save() {
  const v = nameDraft.value.trim()
  if (!series.value || !v) return
  editOpen.value = false
  // the first work's cover is the default, so it is not stored (the series keeps following it)
  const cover = coverDraft.value && coverDraft.value !== defaultCover.value ? coverDraft.value : undefined
  if (v !== series.value.name || cover !== (series.value.cover || undefined)) await put('series', JSON.parse(JSON.stringify({ ...series.value, name: v, cover })))
}

// ---- 心得: several, each with a date, newest first ----
const ratingOpen = ref(false)
const ratingDraft = computed<number | null>({
  get: () => series.value?.rating ?? null,
  set: (v) => {
    if (series.value) void put('series', JSON.parse(JSON.stringify({ ...series.value, rating: v ?? undefined })))
  },
})
/** long reviews show five lines: tap the text to open the rest, tap again to fold it (a short one just opens as usual) */
const openBodies = ref<Record<string, boolean>>({})
function tapBody(e: MouseEvent, key: string) {
  const el = e.currentTarget as HTMLElement
  if (!openBodies.value[key] && el.scrollHeight <= el.clientHeight + 1) return
  e.stopPropagation()
  e.preventDefault()
  openBodies.value = { ...openBodies.value, [key]: !openBodies.value[key] }
}
const tab = ref<'works' | 'review'>(route.query.tab === 'review' ? 'review' : 'works')
// keep the tab in the address, so coming back from a work lands on the same tab
watch(tab, (t) => void router.replace({ query: { ...route.query, tab: t === 'review' ? 'review' : undefined } }))
const noteOpen = ref(false)
const noteNew = ref(true)
const noteDraft = ref<WorkNote>({ id: '', updatedAt: 0, workId: '', date: '', body: '' })
const ownReviews = computed(() => series.value?.reviews ?? [])
/** the series' own reviews and the reviews of its works, newest first; a work's one carries the work (it opens on the work's page) */
const byNewest = (a: { date: string; updatedAt: number }, b: { date: string; updatedAt: number }) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt
/** the series' own reviews, pinned at the top where they can be folded (open by default) */
const mine = computed(() => [...ownReviews.value].sort(byNewest))
const mineOpen = ref(true)
const reviews = computed(() => {
  const ids = new Map(items.value.map((x) => [x.work.id, x.work]))
  return data.notes
    .filter((n) => n.kind !== 'note' && !n.deleted && ids.has(n.workId))
    .map((n) => ({ id: n.id, title: n.title, date: n.date, body: n.body, updatedAt: n.updatedAt, work: ids.get(n.workId) as Work }))
    .sort(byNewest)
})
const worksOpen = ref(true)
const reviewCount = computed(() => mine.value.length + reviews.value.length)
/** the editor is the work notes' one: a review of the series is shaped like a note */
const asNote = (r: SeriesReview): WorkNote => ({ ...r, workId: series.value!.id })
function newReview() {
  noteNew.value = true
  noteDraft.value = { id: uid(), updatedAt: Date.now(), workId: series.value!.id, date: today(), body: '' }
  noteOpen.value = true
}
function editReview(r: SeriesReview) {
  noteNew.value = false
  noteDraft.value = asNote(r)
  noteOpen.value = true
}
async function saveReview(n: WorkNote) {
  if (!series.value) return
  const r: SeriesReview = { id: n.id, title: n.title, date: n.date, body: n.body, updatedAt: Date.now() }
  const list = ownReviews.value.filter((x) => x.id !== r.id)
  await put('series', { ...JSON.parse(JSON.stringify(series.value)), reviews: [...list, r] })
}
async function removeReview() {
  if (!series.value || !(await ui.confirm('刪除這則心得？', { danger: true, confirmText: '刪除' }))) return
  const id = noteDraft.value.id
  await put('series', { ...JSON.parse(JSON.stringify(series.value)), reviews: (series.value.reviews ?? []).filter((x) => x.id !== id) })
}
async function del() {
  if (!series.value || !(await ui.confirm('刪除系列？', { message: '作品會保留，只是不再屬於這個系列。', danger: true, confirmText: '刪除' }))) return
  editOpen.value = false
  await removeSeries(series.value.id)
  void router.replace('/')
}
</script>

<template>
  <div class="relative isolate">
    <!-- the cover, enlarged and blurred, fading into the page background (as on a work's page) -->
    <div v-if="coverUrl" class="pointer-events-none absolute -inset-x-4 -top-24 bottom-14 -z-10 overflow-hidden" aria-hidden="true">
      <img :src="coverUrl" class="size-full scale-125 object-cover opacity-70 blur-2xl" alt="" referrerpolicy="no-referrer" />
      <div class="absolute inset-0 bg-gradient-to-b from-bg/10 via-bg/30 to-bg" />
    </div>
    <PageHeader :title="''" class="!bg-transparent">
      <template #right>
        <button v-if="tab === 'works'" class="circle-btn" :aria-label="view === 'list' ? '改為只顯示封面' : '改為列表'" @click="settings.s.seriesView = view === 'list' ? 'grid' : 'list'">
          <LayoutGrid v-if="view === 'list'" :size="19" />
          <List v-else :size="19" />
        </button>
        <button v-if="tab === 'review'" class="circle-btn" aria-label="寫心得" @click="newReview"><Plus :size="19" /></button>
        <button class="circle-btn" aria-label="編輯系列" @click="edit"><Pencil :size="19" /></button>
      </template>
    </PageHeader>
    <!-- same layout as a work's page: the cover on the left (the series' own, else its first work's), name, score and tags beside it -->
    <div v-if="series" class="mb-4 flex gap-4">
      <WorkCover :src="coverSrc" :title="series.name" class="h-40 w-28 shrink-0 shadow-sm" />
      <div class="min-w-0 flex-1 self-end">
        <p class="mb-0.5 text-xs font-semibold text-muted">系列</p>
        <h1 class="text-lg leading-snug font-bold">{{ series.name }}</h1>
        <button type="button" class="mt-1 flex items-center gap-1.5 text-sm font-semibold" :class="series.rating == null && 'text-xs font-normal text-muted'" @click="ratingOpen = true"><RatingStars :value="series.rating ?? null" :size="14" />{{ series.rating == null ? '點此評分' : formatRating(series.rating) }}</button>
        <button type="button" class="mt-2 flex flex-wrap items-center gap-1.5 text-left" aria-label="設定系列標籤" @click="tagsOpen = true">
          <span v-for="n in tagNames" :key="n" class="tag">{{ n }}</span>
          <span v-if="!tagNames.length" class="text-xs text-muted">＋ 設定標籤</span>
        </button>
      </div>
    </div>
    <PillTabs v-model="tab" size="sm" class="mb-4" :options="[{ value: 'works', label: `作品（${items.length}）` }, { value: 'review', label: reviewCount ? `心得（${reviewCount}）` : '心得' }]" />
  </div>
  <section v-if="series && tab === 'review'" class="mb-4">
    <p v-if="!reviewCount" class="empty-state [--empty-top:16rem]">還沒有心得，對整個系列的想法都可以寫在這裡。</p>
    <!-- 系列心得: pinned at the top, foldable -->
    <div v-if="mine.length" :class="mineOpen ? 'mb-4' : 'mb-2'">
      <button type="button" class="flex w-full items-center gap-1 px-1 py-1.5 text-xs font-medium text-muted" :aria-expanded="mineOpen" @click="mineOpen = !mineOpen">
        系列心得（{{ mine.length }}）
        <ChevronDown :size="16" class="text-muted transition-transform" :class="!mineOpen && '-rotate-90'" />
      </button>
      <ul v-show="mineOpen" class="space-y-3">
        <li v-for="r in mine" :key="r.id">
          <button type="button" class="card block w-full text-left" @click="editReview(r)">
            <p v-if="r.title" class="font-medium">{{ r.title }}</p>
            <p class="text-sm leading-[1.45] whitespace-pre-wrap" :class="[r.title && 'mt-0.5', !openBodies[r.id] && 'line-clamp-5']" @click="tapBody($event, r.id)">{{ r.body }}</p>
            <!-- same small print as the works' reviews: what it is about, and the date -->
            <div class="mt-2 flex items-center gap-2 text-xs text-muted">
              <span class="min-w-0 truncate">系列</span>
              <span class="ml-auto shrink-0">{{ formatFuzzy(r.date) }}</span>
            </div>
          </button>
        </li>
      </ul>
    </div>
    <!-- 作品心得: every work's reviews in one foldable group -->
    <div v-if="reviews.length">
      <button type="button" class="flex w-full items-center gap-1 px-1 py-1.5 text-xs font-medium text-muted" :aria-expanded="worksOpen" @click="worksOpen = !worksOpen">
        作品心得（{{ reviews.length }}）
        <ChevronDown :size="16" class="text-muted transition-transform" :class="!worksOpen && '-rotate-90'" />
      </button>
      <ul v-show="worksOpen" class="space-y-3">
        <li v-for="r in reviews" :key="r.id">
          <RouterLink :to="{ path: `/work/${r.work.id}`, query: { tab: 'review' } }" class="card block w-full text-left">
            <p v-if="r.title" class="font-medium">{{ r.title }}</p>
            <p class="text-sm leading-[1.45] whitespace-pre-wrap" :class="[r.title && 'mt-0.5', !openBodies[r.id] && 'line-clamp-5']" @click="tapBody($event, r.id)">{{ r.body }}</p>
            <!-- which work it is about, with the date, as small print at the bottom -->
            <div class="mt-2 flex items-center gap-2 text-xs text-muted">
              <span class="min-w-0 truncate">{{ r.work.title }}</span>
              <span class="ml-auto shrink-0">{{ formatFuzzy(r.date) }}</span>
            </div>
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
  <TransitionGroup v-show="tab === 'works'" ref="box" tag="ul" :name="dragging || settling ? 'reorder' : 'no-move'" class="relative" :class="view === 'grid' ? 'grid grid-cols-3 gap-x-3 gap-y-4' : 'space-y-2'" @touchmove="onTouchMove">
    <li
      v-for="{ work, record } in shown"
      :key="work.id"
      :data-id="work.id"
      class="select-none [-webkit-touch-callout:none]"
      :class="[
        settling === work.id && 'transition-[translate] duration-200 ease-out',
        dragging === work.id && ['relative z-10 [transform:none!important]', view === 'grid' ? '[&>a]:!scale-105 [&_.lift]:!shadow-xl' : '[&>a]:!scale-[1.03] [&>a]:!bg-surface [&>a]:!shadow-xl'],
      ]"
      :style="dragging === work.id ? { translate: `${offset.x}px ${offset.y}px` } : undefined"
      @pointerdown="press($event, work.id)"
      @pointermove="move"
      @pointerup="release"
      @pointercancel="release"
      @contextmenu.prevent
      @click.capture="swallowClick"
    >
      <RouterLink v-if="view === 'list'" :to="`/work/${work.id}`" draggable="false" class="card flex h-16 items-center gap-3 overflow-hidden px-3 transition-[scale,box-shadow,background-color] duration-200">
        <WorkCover :src="work.cover" :title="work.title" :icon-size="13" class="h-11 w-[31px] shrink-0" />
        <p class="min-w-0 flex-1 truncate text-sm font-medium">{{ work.title }}</p>
        <div class="flex shrink-0 flex-col items-end gap-1 text-xs">
          <StatusPill v-if="record" :status="record.status" />
          <RatingBadge v-if="scoreOf.has(work.id)" :value="scoreOf.get(work.id)!" class="leading-none" />
        </div>
      </RouterLink>
      <RouterLink v-else :to="`/work/${work.id}`" draggable="false" class="block transition-[scale] duration-200">
        <div class="lift relative rounded-xl transition-shadow duration-200" :class="work.cover && 'shadow-sm'">
          <WorkCover :src="work.cover" :title="work.title" class="aspect-[7/10] w-full" />
          <span class="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white backdrop-blur-sm">{{ statusLabel(record?.status ?? 'todo') }}</span>
        </div>
        <p class="mt-1.5 line-clamp-2 text-xs leading-snug font-medium">{{ work.title }}</p>
      </RouterLink>
    </li>
  </TransitionGroup>

  <RatingSheet v-model:open="ratingOpen" v-model="ratingDraft" />
  <NamePickSheet v-model:open="tagsOpen" v-model="tagsModel" title="系列標籤" hint="系列內的作品將會套用這些標籤" multiple :items="tagItems" :create="createTag" />
  <NoteSheet v-model:open="noteOpen" :note="noteDraft" :is-new="noteNew" @save="saveReview" @remove="removeReview" />

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="editOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" @click.self="editOpen = false" @keydown.esc="editOpen = false">
        <form class="card w-full max-w-[21rem] space-y-4 p-5 shadow-xl" role="dialog" aria-label="編輯系列" @submit.prevent="save">
          <h2 class="text-lg leading-snug font-bold">編輯系列</h2>
          <div>
            <label class="label" for="series-name">名稱</label>
            <input id="series-name" v-model="nameDraft" class="input" placeholder="系列名稱" />
          </div>
          <div>
            <p class="label">主圖</p>
            <!-- one row that scrolls sideways when there are many works; each picture is a fifth of the width (less the gaps), so five always fit and the fifth sits flush right -->
            <div v-drag-scroll class="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 [scroll-padding-inline:1.25rem]">
              <button v-for="c in coverChoices" :key="c.id" type="button" class="block aspect-[7/10] w-[calc((100%-2rem)/5)] shrink-0 rounded-lg border-primary transition-[padding] duration-150" :class="coverDraft === c.cover ? 'border-2 p-0.5' : 'border-0 p-0'" :aria-label="c.title" @click="coverDraft = c.cover">
                <WorkCover :src="c.cover" :title="c.title" :icon-size="13" class="size-full" :class="coverDraft === c.cover && '!rounded-sm'" />
              </button>
              <button type="button" class="flex aspect-[7/10] w-[calc((100%-2rem)/5)] shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-muted active:bg-surface-2" aria-label="上傳圖片" @click="coverFile?.click()"><Plus :size="16" /></button>
              <input ref="coverFile" type="file" accept="image/*" class="hidden" @change="pickCover" />
            </div>
          </div>
          <div class="flex gap-3">
            <button type="button" class="btn btn-ghost shrink-0 px-3.5 text-sm text-danger" @click="del">刪除</button>
            <button type="submit" class="btn btn-primary min-w-0 flex-1 disabled:opacity-40" :disabled="!nameDraft.trim()">儲存</button>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>
