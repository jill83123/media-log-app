<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { animateReorder, followPointer, rowAt } from '@/lib/reorderAnim'
import type { SeriesRow } from '@/lib/seriesList'
import { GripVertical } from '@/lib/uiIcons'
import RatingBadge from '@/components/RatingBadge.vue'
import WorkCover from '@/components/WorkCover.vue'

/**
 * Series as a list or as covers (the first work's); a tap opens the series. The rows come already filtered and ordered.
 * Pressing and holding a row (in the list) asks for the order to be edited: while `editing`, the rows carry a grip and can be dragged,
 * and every new order is reported; saving it is up to the page.
 */
const props = defineProps<{ rows: SeriesRow[]; searching?: boolean; editing?: boolean }>()
const emit = defineEmits<{ edit: []; order: [string[]] }>()
const data = useData()
const settings = useSettings()
const grid = computed(() => settings.s.seriesListView === 'grid')

// ---- press and hold: edit the order ----
const HOLD_MS = 500
const SLOP = 8
let holdTimer = 0
let startX = 0
let startY = 0
/** a hold that just fired must not also open the series */
let swallow = false
function press(e: PointerEvent) {
  if (props.editing || (e.pointerType === 'mouse' && e.button !== 0)) return
  startX = e.clientX
  startY = e.clientY
  clearTimeout(holdTimer)
  holdTimer = window.setTimeout(() => {
    holdTimer = 0
    swallow = true
    navigator.vibrate?.(15)
    emit('edit')
    setTimeout(() => (swallow = false), 400)
  }, HOLD_MS)
}
function pressMove(e: PointerEvent) {
  // moving before the hold is over means scrolling
  if (holdTimer && Math.hypot(e.clientX - startX, e.clientY - startY) > SLOP) cancelHold()
}
function cancelHold() {
  clearTimeout(holdTimer)
  holdTimer = 0
}
function swallowClick(e: MouseEvent) {
  if (!swallow) return
  e.preventDefault()
  e.stopPropagation()
}

// ---- drag the grip to reorder (editing only) ----
const work = ref<SeriesRow[] | null>(null)
watch(
  () => props.editing,
  (on) => (work.value = on ? [...props.rows] : null),
  { immediate: true },
)
const dragging = ref('')
const shown = computed(() => (props.editing ? (work.value ?? props.rows) : props.rows))
const box = ref<HTMLElement>()
// the rows slide only while one is being dragged: switching into or out of the editing (the order changes under the list) is instant
animateReorder(box, computed(() => (dragging.value ? work.value : null)))
let follow: ReturnType<typeof followPointer> | undefined
function dragStart(e: PointerEvent, id: string) {
  follow = followPointer(e.currentTarget as HTMLElement, e)
  dragging.value = id
  // listen on the window: the list re-orders the grip's row in the DOM, which drops pointer capture
  document.body.classList.add('is-reordering') // keep the grabbing hand wherever the pointer goes
  window.addEventListener('pointermove', dragMove)
  window.addEventListener('pointerup', dragEnd)
  window.addEventListener('pointercancel', dragEnd)
}
async function dragMove(e: PointerEvent) {
  follow?.move(e)
  const cur = work.value
  if (!cur || !box.value) return
  const from = cur.findIndex((r) => r.id === dragging.value)
  let at = rowAt(box.value, e.clientY, (y, h) => y < h)
  if (at < 0) at = cur.length - 1
  if (at === from) return
  const next = [...cur]
  const [me] = next.splice(from, 1)
  next.splice(at, 0, me!)
  work.value = next
  // its place has changed: once the list has re-ordered, put the row back under the pointer (before the next paint)
  await nextTick()
  follow?.move(e)
}
function stopListening() {
  document.body.classList.remove('is-reordering')
  window.removeEventListener('pointermove', dragMove)
  window.removeEventListener('pointerup', dragEnd)
  window.removeEventListener('pointercancel', dragEnd)
}
function dragEnd() {
  stopListening()
  follow?.end()
  follow = undefined
  dragging.value = ''
  if (work.value) emit('order', work.value.map((r) => r.id))
}

// ---- the covers: pick a series up anywhere (once editing) and drag it over the others ----
const gbox = ref<{ $el: HTMLElement }>()
/** how far the picked-up series is from its own place, so it stays under the finger */
const offset = ref({ x: 0, y: 0 })
let grab = { x: 0, y: 0 }
let lastX = 0
let lastY = 0
const gEl = () => gbox.value?.$el
const liOf = (id: string) => gEl()?.querySelector<HTMLElement>(`[data-id="${id}"]`)
/** the pointer's position inside the list (offsetLeft / offsetTop are measured the same way, free of any movement) */
function inList(x: number, y: number) {
  const r = gEl()!.getBoundingClientRect()
  return { x: x - r.left, y: y - r.top }
}
function place() {
  const li = liOf(dragging.value)
  if (!li) return
  const p = inList(lastX, lastY)
  offset.value = { x: p.x - grab.x - li.offsetLeft, y: p.y - grab.y - li.offsetTop }
}
function gridDown(e: PointerEvent, id: string) {
  if (!props.editing) return press(e)
  if (e.pointerType === 'mouse' && e.button !== 0) return
  lastX = e.clientX
  lastY = e.clientY
  const li = e.currentTarget as HTMLElement
  const p = inList(lastX, lastY)
  grab = { x: p.x - li.offsetLeft, y: p.y - li.offsetTop }
  offset.value = { x: 0, y: 0 }
  dragging.value = id
  document.body.classList.add('is-reordering') // the grabbing hand, wherever the pointer goes
  window.addEventListener('pointermove', gridMove)
  window.addEventListener('pointerup', gridEnd)
  window.addEventListener('pointercancel', gridEnd)
}
async function gridMove(e: PointerEvent) {
  lastX = e.clientX
  lastY = e.clientY
  const cur = work.value
  const el = gEl()
  if (!cur || !el || !dragging.value) return
  place()
  const cells = Array.from(el.children) as HTMLElement[]
  const from = cur.findIndex((r) => r.id === dragging.value)
  // the place under the finger, by where the series sit in the layout
  const p = inList(e.clientX, e.clientY)
  const at = cells.findIndex((c) => p.x >= c.offsetLeft && p.x <= c.offsetLeft + c.offsetWidth && p.y >= c.offsetTop && p.y <= c.offsetTop + c.offsetHeight)
  if (at < 0 || at === from) return
  const next = [...cur]
  const [me] = next.splice(from, 1)
  next.splice(at, 0, me!)
  work.value = next
  // its place has changed: keep it under the finger
  await nextTick()
  place()
}
function gridEnd() {
  document.body.classList.remove('is-reordering')
  window.removeEventListener('pointermove', gridMove)
  window.removeEventListener('pointerup', gridEnd)
  window.removeEventListener('pointercancel', gridEnd)
  dragging.value = ''
  offset.value = { x: 0, y: 0 }
  if (work.value) emit('order', work.value.map((r) => r.id))
}
/** once a series is picked up the page must not scroll under the finger */
function onTouchMove(e: TouchEvent) {
  if (props.editing && e.cancelable) e.preventDefault()
}
onBeforeUnmount(() => {
  stopListening()
  document.body.classList.remove('is-reordering')
  window.removeEventListener('pointermove', gridMove)
  window.removeEventListener('pointerup', gridEnd)
  window.removeEventListener('pointercancel', gridEnd)
  cancelHold()
})
</script>

<template>
  <p v-if="data.ready && !rows.length" class="empty-state [--empty-top:20rem]">{{ searching ? '沒有符合的系列' : '這個類型還沒有系列' }}</p>
  <!-- covers: while editing, a series is picked up anywhere and follows the finger while the others slide out of the way -->
  <TransitionGroup
    v-else-if="grid"
    ref="gbox"
    tag="ul"
    :name="dragging ? 'reorder' : 'no-move'"
    class="relative grid grid-cols-3 gap-x-3 gap-y-4"
    @touchmove="onTouchMove"
    @contextmenu.prevent
  >
    <li
      v-for="r in shown"
      :key="r.id"
      :data-id="r.id"
      class="select-none [-webkit-touch-callout:none]"
      :class="[editing && 'cursor-grab touch-none', dragging === r.id && 'relative z-10 [transform:none!important] [&>a]:!scale-105 [&_.lift]:!shadow-xl']"
      :style="dragging === r.id ? { translate: `${offset.x}px ${offset.y}px` } : undefined"
      @pointerdown="gridDown($event, r.id)"
      @pointermove="pressMove"
      @pointerup="cancelHold"
      @pointercancel="cancelHold"
      @click.capture="swallowClick"
    >
      <RouterLink :to="`/series/${r.id}`" draggable="false" class="block transition-[scale] duration-200" :class="editing && 'pointer-events-none'">
        <div class="lift relative rounded-xl transition-shadow duration-200" :class="r.cover && 'shadow-sm'">
          <WorkCover :src="r.cover" :title="r.name" class="aspect-[7/10] w-full" />
          <!-- how many works it holds (counted in 個, as the settings do: what a work is called differs by type): the same dark label the works' covers carry -->
          <span class="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white backdrop-blur-sm">{{ r.count }} 個</span>
        </div>
        <p class="mt-1.5 line-clamp-2 text-xs leading-snug font-medium">{{ r.name }}</p>
        <RatingBadge v-if="r.rating != null" :value="r.rating" class="mt-0.5 text-xs" />
      </RouterLink>
    </li>
  </TransitionGroup>
  <ul v-else ref="box" class="space-y-2" @contextmenu.prevent>
    <li
      v-for="r in shown"
      :key="r.id"
      class="relative select-none [-webkit-touch-callout:none]"
      :class="dragging === r.id && 'z-10 [&>a]:!shadow-xl'"
      @pointerdown="press"
      @pointermove="pressMove"
      @pointerup="cancelHold"
      @pointercancel="cancelHold"
      @click.capture="swallowClick"
    >
      <RouterLink :to="`/series/${r.id}`" draggable="false" class="card flex h-16 items-center gap-3 overflow-hidden pl-3" :class="editing ? 'pointer-events-none pr-12' : 'pr-3'">
        <WorkCover :src="r.cover" :title="r.name" :icon-size="13" class="h-11 w-[31px] shrink-0" />
        <p class="min-w-0 flex-1 truncate text-sm font-medium">{{ r.name }}<span class="ml-2 text-xs font-normal text-muted">{{ r.count }}</span></p>
        <RatingBadge v-if="r.rating != null" :value="r.rating" class="shrink-0 text-xs leading-none" />
      </RouterLink>
      <span v-if="editing" class="circle-btn absolute top-1/2 right-1 -translate-y-1/2 cursor-grab touch-none text-muted select-none active:cursor-grabbing" aria-label="拖動調整順序" role="button" @pointerdown.stop.prevent="dragStart($event, r.id)"><GripVertical :size="18" /></span>
    </li>
  </ul>
</template>
