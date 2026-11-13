<script setup lang="ts">
import { computed, ref } from 'vue'
import { defaultSourcesFor, SOURCE_LIST, sourcesFor, suitableSourcesFor, type SourceId } from '@/lib/search'
import { workTypes } from '@/lib/meta'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { GripVertical, RotateCcw } from '@/lib/uiIcons'
import PageHeader from '@/components/PageHeader.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const window = globalThis.window
const settings = useSettings()
const ui = useUi()
const types = computed(() => workTypes())
/** the kind of work whose sources are being set */
const cur = ref<string>(types.value[0]?.value ?? 'anime')

const mine = () => settings.s.sourcesByType as Record<string, SourceId[]>
/** this type's sources that are on, in its order */
const on = computed(() => sourcesFor(cur.value, mine()))
const defaults = computed(() => defaultSourcesFor(cur.value))
const info = (id: SourceId) => SOURCE_LIST.find((s) => s.id === id)!
/** every source: the ones that are on in order, then the ones that are off */
const rows = computed(() => [
  ...on.value.map((id) => ({ ...info(id), on: true })),
  ...SOURCE_LIST.filter((s) => suitableSourcesFor(cur.value).includes(s.id) && !on.value.includes(s.id)).map((s) => ({ ...s, on: false })),
])
const isDefault = (type: string) => !settings.s.sourcesByType[type] || settings.s.sourcesByType[type]!.join() === defaultSourcesFor(type).join()
const anyChanged = computed(() => types.value.some((t) => !isDefault(t.value)))

function save(list: SourceId[]) {
  settings.s.sourcesByType = { ...settings.s.sourcesByType, [cur.value]: list }
}
function toggle(id: SourceId, v: boolean) {
  save(v ? [...on.value, id] : on.value.filter((x) => x !== id))
}
/** drag a row by its handle: it follows the finger and swaps places with the row it passes over */
let listEl: HTMLElement | null = null
const dragging = ref<SourceId | null>(null)
function startDrag(id: SourceId, e: PointerEvent) {
  dragging.value = id
  listEl = (e.currentTarget as HTMLElement).closest('ul')
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onDrag(e: PointerEvent) {
  if (!dragging.value || !listEl) return
  const items = [...listEl.querySelectorAll<HTMLElement>('[data-on]')]
  const list = [...on.value]
  const from = list.indexOf(dragging.value)
  let to = items.findIndex((el) => e.clientY < el.getBoundingClientRect().bottom)
  if (to < 0) to = items.length - 1
  if (from < 0 || to === from) return
  list.splice(to, 0, list.splice(from, 1)[0]!)
  save(list)
}
const endDrag = () => (dragging.value = null)
async function reset() {
  if (!(await ui.confirm('還原所有類型的預設來源與順序？', { confirmText: '還原' }))) return
  settings.s.sourcesByType = {}
  ui.toast('已還原預設', 'success')
}
</script>

<template>
  <PageHeader title="搜尋來源" :back="window.history.state?.back ? undefined : '/settings'">
    <template #right><button class="circle-btn disabled:opacity-30" :disabled="!anyChanged" aria-label="還原預設" @click="reset"><RotateCcw :size="20" /></button></template>
  </PageHeader>
  <p class="-mt-1 mb-3 px-1 text-xs text-muted">每種類型各自設定，只列出適合的來源；開啟的可拖動排序。</p>

  <div v-drag-scroll class="scrollbar-none -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
    <button v-for="t in types" :key="t.value" class="chip shrink-0" :class="cur === t.value && 'chip-on'" @click="cur = t.value">{{ t.label }}</button>
  </div>

  <TransitionGroup tag="ul" :name="dragging ? 'flip' : 'none'" class="card inset-divide mb-3 overflow-hidden p-0">
    <li v-for="r in rows" :key="r.id" :data-on="r.on || undefined" class="relative flex items-center gap-2 bg-surface px-5 py-3" :class="dragging === r.id && 'z-10 scale-[1.02] bg-surface-2 shadow-lg'">
      <div class="min-w-0 flex-1" :class="!r.on && 'opacity-50'">
        <p>{{ r.label }}<span v-if="!defaults.includes(r.id)" class="ml-1.5 text-xs text-muted">（預設關閉）</span></p>
        <p class="mt-0.5 text-xs text-muted">{{ r.hint }}</p>
      </div>
      <button v-if="r.on" class="touch-none px-1 py-2 text-muted" aria-label="拖動排序" @pointerdown.prevent="startDrag(r.id, $event)" @pointermove="onDrag" @pointerup="endDrag" @pointercancel="endDrag"><GripVertical :size="18" /></button>
      <ToggleSwitch class="ml-2" :model-value="r.on" :label="r.label" @update:model-value="toggle(r.id, $event)" />
    </li>
  </TransitionGroup>
  <p v-if="!on.length" class="mb-5 px-1 text-xs text-danger">這個類型沒有開啟任何來源，搜尋不會有結果。</p>
</template>

<style scoped>
.flip-move {
  transition: transform 0.2s;
}
</style>
