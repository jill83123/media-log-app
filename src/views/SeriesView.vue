<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { put, removeSeries } from '@/lib/repo'
import { formatRating, formatScore, scoreOf } from '@/lib/ratings'
import { statusLabel } from '@/lib/meta'
import { LayoutGrid, List, Pencil } from '@/lib/uiIcons'
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
const done = computed(() => items.value.filter((x) => x.record?.status === 'done').length)
const avg = computed(() => {
  const r = items.value.map((x) => (x.record?.rating == null ? undefined : scoreOf(x.record.rating))).filter((v): v is number => v != null)
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null
})

/** the pencil opens one small dialog for the name and for deleting the series */
const editOpen = ref(false)
const nameDraft = ref('')
function edit() {
  nameDraft.value = series.value?.name ?? ''
  editOpen.value = true
}
async function save() {
  const v = nameDraft.value.trim()
  if (!series.value || !v) return
  editOpen.value = false
  if (v !== series.value.name) await put('series', { ...series.value, name: v })
}
async function del() {
  if (!series.value || !(await ui.confirm('刪除系列？', { message: '作品會保留，只是不再屬於這個系列。', danger: true, confirmText: '刪除' }))) return
  editOpen.value = false
  await removeSeries(series.value.id)
  void router.replace('/')
}
</script>

<template>
  <PageHeader :title="series?.name ?? ''">
    <template #right>
      <button class="circle-btn" :aria-label="view === 'list' ? '改為只顯示封面' : '改為列表'" @click="settings.s.seriesView = view === 'list' ? 'grid' : 'list'">
        <LayoutGrid v-if="view === 'list'" :size="19" />
        <List v-else :size="19" />
      </button>
      <button class="circle-btn" aria-label="編輯系列" @click="edit"><Pencil :size="19" /></button>
    </template>
  </PageHeader>
  <div class="card mb-4 flex justify-around text-center">
    <div><p class="text-xl font-bold">{{ items.length }}</p><p class="text-xs text-muted">作品</p></div>
    <div><p class="text-xl font-bold">{{ done }}</p><p class="text-xs text-muted">已看完</p></div>
    <div><p class="text-xl font-bold">{{ avg == null ? '—' : formatScore(avg) }}</p><p class="text-xs text-muted">平均分</p></div>
  </div>
  <TransitionGroup ref="box" tag="ul" name="reorder" class="relative" :class="view === 'grid' ? 'grid grid-cols-3 gap-x-3 gap-y-4' : 'space-y-2'" @touchmove="onTouchMove">
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
        <WorkCover :src="work.cover" :title="work.title" :icon-size="13" class="h-11 w-[33px] shrink-0" />
        <p class="min-w-0 flex-1 truncate text-sm font-medium">{{ work.title }}</p>
        <div class="flex shrink-0 flex-col items-end gap-1 text-xs">
          <StatusPill v-if="record" :status="record.status" />
          <span v-if="record?.rating != null" class="leading-none font-semibold text-warn">★ {{ formatRating(record.rating) }}</span>
        </div>
      </RouterLink>
      <RouterLink v-else :to="`/work/${work.id}`" draggable="false" class="block transition-[scale] duration-200">
        <div class="lift relative rounded-xl transition-shadow duration-200" :class="work.cover && 'shadow-sm'">
          <WorkCover :src="work.cover" :title="work.title" class="aspect-[3/4] w-full" />
          <span class="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white backdrop-blur-sm">{{ statusLabel(record?.status ?? 'todo') }}</span>
        </div>
        <p class="mt-1.5 line-clamp-2 text-xs leading-snug font-medium">{{ work.title }}</p>
      </RouterLink>
    </li>
  </TransitionGroup>

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="editOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" @click.self="editOpen = false" @keydown.esc="editOpen = false">
        <form class="card w-full max-w-[21rem] space-y-4 p-5 shadow-xl" role="dialog" aria-label="編輯系列" @submit.prevent="save">
          <h2 class="text-lg leading-snug font-bold">編輯系列</h2>
          <input v-model="nameDraft" class="input" placeholder="系列名稱" autofocus />
          <div class="flex gap-3">
            <button type="button" class="btn btn-ghost shrink-0 px-3.5 text-sm text-danger" @click="del">刪除</button>
            <button type="submit" class="btn btn-primary min-w-0 flex-1 disabled:opacity-40" :disabled="!nameDraft.trim()">儲存</button>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>
