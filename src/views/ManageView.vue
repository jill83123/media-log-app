<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { typeLabel, workTypes } from '@/lib/meta'
import { createSeries, createTag, put, removeSeries, removeTag } from '@/lib/repo'
import { GripVertical, Plus } from '@/lib/uiIcons'
import PopupDialog from '@/components/PopupDialog.vue'
import PageHeader from '@/components/PageHeader.vue'

/** Rename / delete / add tags and series. */
const route = useRoute()
const data = useData()
const ui = useUi()
const kind = computed(() => route.params.kind as 'tags' | 'series')
const title = computed(() => ({ tags: '標籤', series: '系列' })[kind.value])
const text = ref('')
const open = ref(false)

type Row = { id: string; name: string; depth: number; count: number; parentId?: string; /** series are listed under the work type they mostly hold */ group?: string }
const rows = computed<Row[]>(() => {
  if (kind.value === 'tags') return data.tags.map((t) => ({ id: t.id, name: t.name, depth: 0, count: data.works.filter((w) => w.tagIds.includes(t.id)).length }))
  const order = workTypes().map((t) => t.value as string)
  const rank = (g: string) => (order.includes(g) ? order.indexOf(g) : order.length)
  const list = data.series.map((s) => {
    const mine = data.works.filter((w) => w.seriesId === s.id)
    const counts = new Map<string, number>()
    for (const w of mine) counts.set(w.type, (counts.get(w.type) ?? 0) + 1)
    const group = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    return { id: s.id, name: s.name, depth: 0, count: mine.length, group, parentId: group }
  })
  // grouped by type (in the type list's order); inside a group, the user's own order
  return list.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.group) - rank(b.r.group) || a.i - b.i).map((x) => x.r)
})

// drag the grip to reorder
const dragList = ref<Row[] | null>(null)
const dragging = ref('')
const shown = computed(() => dragList.value ?? rows.value)
const box = ref<HTMLElement>()
const groupLabel = (g: string) => (g ? typeLabel(g) : '未分類')
const startsGroup = (list: Row[], i: number) => kind.value === 'series' && list[i]!.group !== list[i - 1]?.group
const blockEnd = (list: Row[], i: number) => {
  let j = i + 1
  while (j < list.length && list[j]!.depth > list[i]!.depth) j++
  return j
}
function dragStart(e: PointerEvent, id: string) {
  dragList.value = [...rows.value]
  dragging.value = id
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function dragMove(e: PointerEvent) {
  const cur = dragList.value
  if (!cur || !box.value) return
  const items = Array.from(box.value.children) as HTMLElement[]
  const from = cur.findIndex((r) => r.id === dragging.value)
  const me = cur[from]!
  let at = items.findIndex((el) => e.clientY < el.getBoundingClientRect().bottom)
  if (at < 0) at = cur.length - 1
  // climb to the row at this position that shares the dragged row's parent
  while (at >= 0 && cur[at]!.parentId !== me.parentId && cur[at]!.depth > me.depth) at--
  while (at >= 0 && cur[at]!.depth > me.depth) at--
  if (at < 0 || cur[at]!.parentId !== me.parentId || at === from) return
  const size = blockEnd(cur, from) - from
  const block = cur.slice(from, from + size)
  const rest = [...cur.slice(0, from), ...cur.slice(from + size)]
  const target = rest.findIndex((r) => r.id === cur[at]!.id)
  const insertAt = at > from ? blockEnd(rest, target) : target
  dragList.value = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
}
async function dragEnd() {
  const next = dragList.value
  dragList.value = null
  dragging.value = ''
  if (!next || next.every((r, i) => r.id === rows.value[i]?.id)) return
  // number every row among its siblings, in the new order
  const seen = new Map<string, number>()
  for (const r of next) {
    const key = r.parentId ?? ''
    const order = seen.get(key) ?? 0
    seen.set(key, order + 1)
    if (kind.value === 'tags') await put('tags', { ...data.tags.find((t) => t.id === r.id)!, order })
    else await put('series', { ...data.series.find((s) => s.id === r.id)!, order })
  }
}

async function add() {
  const name = text.value.trim()
  if (!name) return
  if (kind.value === 'tags') await createTag(name)
  else await createSeries(name)
  text.value = ''
  open.value = false
}
const editing = ref<Row | null>(null)
const editName = ref('')
const editOpen = computed({ get: () => editing.value !== null, set: (v) => !v && (editing.value = null) })
function edit(r: Row) {
  editing.value = r
  editName.value = r.name
}
async function rename() {
  const r = editing.value
  const v = editName.value.trim()
  if (!r || !v) return
  if (v !== r.name) {
    if (kind.value === 'tags') await put('tags', { ...data.tags.find((t) => t.id === r.id)!, name: v })
    else await put('series', { ...data.series.find((s) => s.id === r.id)!, name: v })
  }
  editing.value = null
}
async function del() {
  const r = editing.value
  if (!r) return
  const msg = r.count ? `${r.count} 部作品使用中，刪除後只會移除這個標記。` : undefined
  editing.value = null
  if (!(await ui.confirm(`刪除「${r.name}」？`, { message: msg, danger: true, confirmText: '刪除' }))) return
  if (kind.value === 'tags') await removeTag(r.id)
  else await removeSeries(r.id)
}
</script>

<template>
  <PageHeader :title="title" back="/settings">
    <template #right>
      <button class="inline-flex size-10 items-center justify-center text-ink transition active:scale-90" :aria-label="`新增${title}`" @click="open = true"><Plus :size="28" :stroke-width="2" /></button>
    </template>
  </PageHeader>
  <p v-if="!rows.length" class="py-10 text-center text-sm text-muted">還沒有{{ title }}</p>
  <ul v-else ref="box" class="card divide-y divide-line p-0">
    <li v-for="(r, i) in shown" :key="r.id" :class="dragging === r.id && 'relative z-10 rounded-xl bg-surface shadow-lg'">
      <p v-if="startsGroup(shown, i)" class="px-4 pt-3 pb-1 text-xs font-semibold text-muted">{{ groupLabel(r.group ?? '') }}</p>
      <div class="flex items-center gap-2 py-2 pr-2" :style="{ paddingLeft: `${1 + r.depth * 1.25}rem` }">
        <button class="flex min-w-0 flex-1 items-center gap-2 py-1 text-left" @click="edit(r)">
          <span class="truncate">{{ r.name }}</span>
          <span class="shrink-0 text-xs text-muted">{{ r.count }}</span>
        </button>
        <span class="circle-btn cursor-grab touch-none text-muted select-none active:cursor-grabbing" aria-label="拖動調整順序" role="button" @pointerdown.prevent="dragStart($event, r.id)" @pointermove="dragMove" @pointerup="dragEnd" @pointercancel="dragEnd"><GripVertical :size="18" /></span>
      </div>
    </li>
  </ul>

  <PopupDialog v-model="open">
    <form class="card w-full max-w-[21rem] space-y-4 p-5 shadow-xl" role="dialog" :aria-label="`新增${title}`" @submit.prevent="add">
      <h2 class="text-lg leading-snug font-bold">新增{{ title }}</h2>
      <input v-model="text" class="input" :placeholder="`${title}名稱`" />
      <button type="submit" class="btn btn-primary w-full disabled:opacity-40" :disabled="!text.trim()">新增</button>
    </form>
  </PopupDialog>

  <PopupDialog v-model="editOpen">
    <form class="card w-full max-w-[21rem] space-y-4 p-5 shadow-xl" role="dialog" :aria-label="`編輯${title}`" @submit.prevent="rename">
      <h2 class="text-lg leading-snug font-bold">編輯{{ title }}</h2>
      <input v-model="editName" class="input" :placeholder="`${title}名稱`" />
      <div class="flex gap-3">
        <button type="button" class="btn btn-ghost shrink-0 px-3.5 text-sm text-danger" @click="del">刪除</button>
        <button type="submit" class="btn btn-primary min-w-0 flex-1 disabled:opacity-40" :disabled="!editName.trim()">儲存</button>
      </div>
    </form>
  </PopupDialog>
</template>
