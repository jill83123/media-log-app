<script setup lang="ts">
import { computed, ref } from 'vue'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { createTag, put, removeTag } from '@/lib/repo'
import { Plus } from '@/lib/uiIcons'
import PopupDialog from '@/components/PopupDialog.vue'
import PageHeader from '@/components/PageHeader.vue'

/** Rename / delete / add tags. They are listed by how many works use them (the same order every tag list shows). */
const data = useData()
const ui = useUi()
const text = ref('')
const open = ref(false)

const rows = computed(() => data.tagsByUse.map((t) => ({ id: t.id, name: t.name, count: data.tagUse.get(t.id) ?? 0 })))
type Row = (typeof rows.value)[number]

async function add() {
  const name = text.value.trim()
  if (!name) return
  await createTag(name)
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
  if (v !== r.name) await put('tags', { ...data.tags.find((t) => t.id === r.id)!, name: v })
  editing.value = null
}
async function del() {
  const r = editing.value
  if (!r) return
  const msg = r.count ? `${r.count} 部作品使用中，刪除後只會移除這個標記。` : undefined
  editing.value = null
  if (!(await ui.confirm(`刪除「${r.name}」？`, { message: msg, danger: true, confirmText: '刪除' }))) return
  await removeTag(r.id)
}
</script>

<template>
  <PageHeader title="標籤" back="/settings">
    <template #right>
      <button class="inline-flex size-10 items-center justify-center text-ink transition active:scale-90" aria-label="新增標籤" @click="open = true"><Plus :size="28" :stroke-width="2" /></button>
    </template>
  </PageHeader>
  <p v-if="!rows.length" class="empty-state [--empty-top:10rem]">還沒有標籤</p>
  <ul v-else class="card divide-y divide-line p-0">
    <li v-for="r in rows" :key="r.id">
      <button class="flex w-full items-center gap-2 px-4 py-3 text-left" @click="edit(r)">
        <span class="truncate">{{ r.name }}</span>
        <span class="shrink-0 text-xs text-muted">{{ r.count }}</span>
      </button>
    </li>
  </ul>

  <PopupDialog v-model="open">
    <form class="card w-full max-w-[21rem] space-y-4 p-5 shadow-xl" role="dialog" aria-label="新增標籤" @submit.prevent="add">
      <h2 class="text-lg leading-snug font-bold">新增標籤</h2>
      <input v-model="text" class="input" placeholder="標籤名稱" />
      <button type="submit" class="btn btn-primary w-full disabled:opacity-40" :disabled="!text.trim()">新增</button>
    </form>
  </PopupDialog>

  <PopupDialog v-model="editOpen">
    <form class="card w-full max-w-[21rem] space-y-4 p-5 shadow-xl" role="dialog" aria-label="編輯標籤" @submit.prevent="rename">
      <h2 class="text-lg leading-snug font-bold">編輯標籤</h2>
      <input v-model="editName" class="input" placeholder="標籤名稱" />
      <div class="flex gap-3">
        <button type="button" class="btn btn-ghost shrink-0 px-3.5 text-sm text-danger" @click="del">刪除</button>
        <button type="submit" class="btn btn-primary min-w-0 flex-1 disabled:opacity-40" :disabled="!editName.trim()">儲存</button>
      </div>
    </form>
  </PopupDialog>
</template>
