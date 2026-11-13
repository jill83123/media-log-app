<script setup lang="ts">
import { computed, ref } from 'vue'
import { allTypes, DEFAULT_TYPES, mergeTypes, type TypeDef } from '@/lib/meta'
import { uid } from '@/lib/id'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { Eye, EyeOff, GripVertical, Plus, RotateCcw } from '@/lib/uiIcons'
import PopupDialog from '@/components/PopupDialog.vue'
import PageHeader from '@/components/PageHeader.vue'
import SelectField from '@/components/SelectField.vue'
import { animateReorder, followPointer, rowAt } from '@/lib/reorderAnim'

const settings = useSettings()
const data = useData()
const ui = useUi()

const list = computed(() => allTypes())
const countOf = (id: string) => data.works.filter((w) => w.type === id).length
const save = (next: TypeDef[]) => (settings.s.types = next.map((t) => ({ value: t.value, label: t.label, unit: t.unit, hidden: !!t.hidden })))

function toggleHidden(t: TypeDef) {
  if (!t.hidden && list.value.filter((x) => !x.hidden).length <= 1) return ui.toast('至少要留一個顯示的類型', 'error')
  save(list.value.map((x) => (x.value === t.value ? { ...x, hidden: !x.hidden } : x)))
}

// drag the grip to reorder: the list follows the finger and is saved when it is let go
const dragList = ref<TypeDef[] | null>(null)
const dragging = ref('')
const shown = computed(() => dragList.value ?? list.value)
const rows = ref<HTMLElement>()
animateReorder(rows, shown)
let follow: ReturnType<typeof followPointer> | undefined
function dragStart(e: PointerEvent, id: string) {
  follow = followPointer(e.currentTarget as HTMLElement, e)
  dragList.value = [...list.value]
  dragging.value = id
  // listen on the window: the list re-orders the grip's row in the DOM, which drops pointer capture
  document.body.classList.add('is-reordering') // keep the grabbing hand wherever the pointer goes
  window.addEventListener('pointermove', dragMove)
  window.addEventListener('pointerup', dragEnd)
  window.addEventListener('pointercancel', dragEnd)
}
function dragMove(e: PointerEvent) {
  follow?.move(e)
  const cur = dragList.value
  if (!cur || !rows.value) return
  const from = cur.findIndex((t) => t.value === dragging.value)
  let to = rowAt(rows.value, e.clientY, (y, h) => y < h / 2)
  if (to < 0) to = cur.length - 1
  if (to === from) return
  const next = [...cur]
  next.splice(to, 0, next.splice(from, 1)[0]!)
  dragList.value = next
}
function dragEnd() {
  document.body.classList.remove('is-reordering')
  window.removeEventListener('pointermove', dragMove)
  window.removeEventListener('pointerup', dragEnd)
  window.removeEventListener('pointercancel', dragEnd)
  follow?.end()
  follow = undefined
  const next = dragList.value
  dragList.value = null
  dragging.value = ''
  if (next && next.some((t, i) => t.value !== list.value[i]?.value)) save(next)
}
// adding / editing one of the user's own types
const editing = ref<string | 'new' | null>(null)
const draft = ref({ label: '', unit: '%' })
const open = computed({ get: () => editing.value !== null, set: (v) => !v && (editing.value = null) })
const current = computed(() => list.value.find((x) => x.value === editing.value))
const base = computed(() => DEFAULT_TYPES.find((x) => x.value === editing.value))
const defaultUnit = computed(() => base.value?.unit)
const unitItems = computed(() => [...new Set([...(defaultUnit.value ? [defaultUnit.value] : []), ...settings.s.units, draft.value.unit])].map((u) => ({ value: u, label: u === defaultUnit.value ? `${u}（預設）` : u })))
async function restoreName() {
  if (base.value && (await ui.confirm('還原名稱？', { message: `名稱會改回「${base.value.label}」。`, confirmText: '還原' }))) draft.value.label = base.value.label
}
function edit(v: string | 'new') {
  const t = list.value.find((x) => x.value === v)
  draft.value = t ? { label: t.label, unit: t.unit } : { label: '', unit: '%' }
  editing.value = v
}
function saveType() {
  const label = draft.value.label.trim()
  if (!label) return ui.toast('請輸入類型名稱', 'error')
  if (list.value.some((t) => t.label === label && t.value !== editing.value)) return ui.toast('已經有同名的類型', 'error')
  if (editing.value === 'new') save([...list.value, { value: 'c_' + uid().slice(0, 8), label, unit: draft.value.unit, custom: true }])
  else save(list.value.map((t) => (t.value === editing.value ? { ...t, label, unit: draft.value.unit } : t)))
  editing.value = null
}
async function removeType() {
  const id = editing.value
  if (!id || id === 'new') return
  const n = countOf(id)
  if (n) return ui.toast(`有 ${n} 個作品是這個類型，無法刪除；可以先把它隱藏`, 'error')
  save(mergeTypes(list.value.filter((t) => t.value !== id)))
  editing.value = null
}
</script>

<template>
  <PageHeader title="作品類型" back="/settings">
    <template #right>
      <button class="inline-flex size-10 items-center justify-center text-ink transition active:scale-90" aria-label="新增類型" @click="edit('new')"><Plus :size="28" :stroke-width="2" /></button>
    </template>
  </PageHeader>
  <ul ref="rows" class="card mb-3 divide-y divide-line p-0">
    <li v-for="t in shown" :key="t.value" class="flex items-center gap-1 py-1 pr-2 pl-4 transition-shadow" :class="dragging === t.value && 'relative z-10 rounded-xl bg-surface shadow-lg'">
      <button class="flex min-w-0 flex-1 items-center gap-2 py-2 text-left" :class="t.hidden && 'text-muted'" @click="edit(t.value)">
        <span class="truncate">{{ t.label }}</span>
        <span class="shrink-0 text-xs text-muted">{{ t.unit }}</span>
        <span v-if="t.custom" class="tag shrink-0">自訂</span>
      </button>
      <button class="icon-btn border-0 bg-transparent" :aria-label="t.hidden ? '顯示' : '隱藏'" @click="toggleHidden(t)">
        <EyeOff v-if="t.hidden" :size="18" class="text-muted" />
        <Eye v-else :size="18" />
      </button>
      <span class="icon-btn cursor-grab touch-none border-0 bg-transparent text-muted select-none active:cursor-grabbing" aria-label="拖動調整順序" role="button" @pointerdown.prevent="dragStart($event, t.value)"><GripVertical :size="18" /></span>
    </li>
  </ul>

  <PopupDialog v-model="open">
    <div class="card w-full max-w-[23rem] space-y-4 p-5 shadow-xl" role="dialog" :aria-label="editing === 'new' ? '新增類型' : '編輯類型'">
      <h2 class="text-lg leading-snug font-bold">{{ editing === 'new' ? '新增類型' : '編輯類型' }}</h2>
      <div>
        <span class="label">名稱</span>
        <div class="relative">
          <input v-model="draft.label" class="input" :class="base && draft.label.trim() !== base.label && 'pr-12'" placeholder="例如：遊戲、紀錄片" />
          <button v-if="base && draft.label.trim() !== base.label" class="absolute inset-y-0 right-1 grid w-10 place-items-center text-muted" aria-label="還原" @click="restoreName"><RotateCcw :size="17" /></button>
        </div>
      </div>
      <div>
        <span class="label">預設進度單位</span>
        <SelectField v-model="draft.unit" title="預設進度單位" :items="unitItems" />
      </div>
      <div class="grid gap-2" :class="current?.custom && 'grid-cols-[auto_1fr]'">
        <button v-if="current?.custom" class="btn btn-ghost px-3.5 text-sm text-danger" @click="removeType">刪除</button>
        <button class="btn btn-primary" @click="saveType">儲存</button>
      </div>
    </div>
  </PopupDialog>
</template>
