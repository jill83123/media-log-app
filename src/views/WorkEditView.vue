<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Progress, Status, Work, WorkType } from '@/db/types'
import { createRecord, createSeries, createTag, createWork, emptyProgress, put, removeWork } from '@/lib/repo'
import { fileToCover } from '@/lib/image'
import { progressText, STATUSES, statusLabel, typeLabel as typeLabelOf, typeUnit, workTypes } from '@/lib/meta'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { ChevronRight, ImagePlus, Link, Search, X } from '@/lib/uiIcons'
import PopupDialog from '@/components/PopupDialog.vue'
import CoverSearchSheet, { type Found } from '@/components/CoverSearchSheet.vue'
import ProgressSheet from '@/components/ProgressSheet.vue'
import PageHeader from '@/components/PageHeader.vue'
import PickSheet from '@/components/PickSheet.vue'
import WorkCover from '@/components/WorkCover.vue'
import NamePickSheet from '@/components/NamePickSheet.vue'

const route = useRoute()
const router = useRouter()
const data = useData()
const ui = useUi()

const editingId = computed(() => (route.params.id as string | undefined) ?? '')
type Form = Partial<Work> & { title: string; type: WorkType; tagIds: string[] }
/** a new work starts as the kind the list was last showing, not a fixed one */
// a new work has no type until one is picked, so a stray tap can't leave the wrong one
const form = ref<Form>({ title: '', type: '' as WorkType, tagIds: [] })
const status = ref<Status>('todo')
const progress = ref<Progress>(emptyProgress('集'))
const fileEl = ref<HTMLInputElement>()
const tagsOpen = ref(false)
const seriesOpen = ref(false)
const progressOpen = ref(false)
const searchOpen = ref(false)
const coverMenu = ref(false)
const coverSearchOpen = ref(false)
const typeOpen = ref(false)
const statusOpen = ref(false)
/** on an existing work the row shows only the default a new round starts with */
const defaultText = computed(() => {
  const p = progress.value
  return p.infinite || !p.total ? `${p.unit}（不限）` : `共 ${p.total} ${p.unit}`
})
const typeLabel = computed(() => (form.value.type ? typeLabelOf(form.value.type) : ''))

function openSearch() {
  searchOpen.value = true
}
function applyFound(f: Found) {
  // the type chosen in the search is saved with the work
  if (f.type) setType(f.type)
  if (f.total) progress.value = { ...progress.value, total: f.total, infinite: false }
  if (f.title) form.value.title = f.title
  if (f.cover) form.value.cover = f.cover
  if (f.creators) form.value.creators = f.creators
  form.value.ext = { ...form.value.ext, ...f.ext }
}

onMounted(() => {
  if (editingId.value) {
    const w = data.workById.get(editingId.value)
    if (w) {
      form.value = { ...w, tagIds: [...w.tagIds] }
      progress.value = { ...(w.defaultProgress ?? emptyProgress(typeUnit(w.type))), current: 0 }
    }
  } else progress.value = emptyProgress('集')
})

function setType(t: WorkType) {
  form.value.type = t
  if (!editingId.value) progress.value = { ...progress.value, unit: typeUnit(t) }
}

async function pickFile(e: Event) {
  const el = e.target as HTMLInputElement
  const f = el.files?.[0]
  if (!f) return
  try {
    form.value.cover = await fileToCover(f)
  } catch {
    ui.toast('無法讀取這張圖片', 'error')
  }
  el.value = ''
}
async function coverUrl() {
  const v = await ui.prompt('封面圖片網址', { value: form.value.cover?.startsWith('data:') ? '' : (form.value.cover ?? '') })
  if (v) form.value.cover = v
}

const tagItems = computed(() => data.tags.map((t) => ({ id: t.id, name: t.name })))
const seriesItems = computed(() => data.series.map((s) => ({ id: s.id, name: s.name })))
const seriesModel = computed({ get: () => (form.value.seriesId ? [form.value.seriesId] : []), set: (v) => (form.value.seriesId = v[0]) })
const seriesName = computed(() => data.series.find((s) => s.id === form.value.seriesId)?.name)
const tagNames = computed(() =>
  form.value.tagIds
    .map((id) => data.tags.find((t) => t.id === id)?.name)
    .filter(Boolean)
    .join('、'),
)

async function save() {
  const f = form.value
  if (!f.title.trim()) return ui.toast('請輸入標題', 'error')
  if (!f.type) return ui.toast('請選擇類型', 'error')
  // the form is a reactive proxy, which IndexedDB can't clone: save a plain copy
  const patch = JSON.parse(JSON.stringify({ ...f, title: f.title.trim(), defaultProgress: { ...progress.value, current: 0 } }))
  if (editingId.value) {
    await put('works', patch as Work)
    void router.replace(`/work/${editingId.value}`)
  } else {
    const w = await createWork(patch)
    await createRecord(w.id, { status: status.value, progress: { ...progress.value } })
    void router.replace(`/work/${w.id}`)
  }
}
async function removeThis() {
  const w = data.workById.get(editingId.value)
  if (!w || !(await ui.confirm('刪除這個作品？', { message: '所有刷次與紀錄都會一併刪除。', danger: true, confirmText: '刪除' }))) return
  await removeWork(w.id)
  void router.replace('/')
}
</script>

<template>
  <PageHeader :title="editingId ? '編輯作品' : '新增作品'">
    <template #right><button class="circle-btn" aria-label="搜尋作品資料" @click="openSearch"><Search :size="20" /></button></template>
  </PageHeader>

  <div class="space-y-4 pb-2">
    <!-- the cover with the two fields the search fills in -->
    <div class="flex gap-4">
      <div class="w-28 shrink-0 space-y-2">
        <button type="button" class="block rounded-xl transition active:scale-[0.97]" aria-label="編輯圖片" @click="coverMenu = true">
          <WorkCover :src="form.cover" :title="form.title || '封面'" class="h-40 w-28 shadow-sm" />
        </button>
        <input ref="fileEl" type="file" accept="image/*" class="hidden" @change="pickFile" />
      </div>
      <div class="min-w-0 flex-1 space-y-3">
        <div><span class="label">標題</span><input v-model="form.title" class="input" placeholder="作品名稱" /></div>
        <div><span class="label">作者／製作</span><input v-model="form.creators" class="input" /></div>
      </div>
    </div>

    <!-- one plain list: label on the left, the choice on the right -->
    <ul class="card inset-divide overflow-hidden p-0">
      <li>
        <button class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition active:bg-surface-2" @click="typeOpen = true">
          <span class="w-10 shrink-0 text-sm text-muted">類型</span>
          <span class="min-w-0 flex-1 truncate text-right" :class="!typeLabel && 'text-muted'">{{ typeLabel || '請選擇' }}</span>
          <ChevronRight :size="18" class="shrink-0 text-muted" />
        </button>
      </li>
      <li v-if="!editingId">
        <button class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition active:bg-surface-2" @click="statusOpen = true">
          <span class="w-10 shrink-0 text-sm text-muted">狀態</span>
          <span class="min-w-0 flex-1 truncate text-right">{{ statusLabel(status) }}</span>
          <ChevronRight :size="18" class="shrink-0 text-muted" />
        </button>
      </li>
      <li>
        <button class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition active:bg-surface-2" @click="progressOpen = true">
          <span class="w-10 shrink-0 text-sm text-muted">進度</span>
          <span class="min-w-0 flex-1 truncate text-right">{{ editingId ? defaultText : progressText(progress) }}</span>
          <ChevronRight :size="18" class="shrink-0 text-muted" />
        </button>
      </li>
      <li>
        <button class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition active:bg-surface-2" @click="tagsOpen = true">
          <span class="w-10 shrink-0 text-sm text-muted">標籤</span>
          <span class="min-w-0 flex-1 truncate text-right" :class="!tagNames && 'text-muted'">{{ tagNames || '未設定' }}</span>
          <ChevronRight :size="18" class="shrink-0 text-muted" />
        </button>
      </li>
      <li>
        <button class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition active:bg-surface-2" @click="seriesOpen = true">
          <span class="w-10 shrink-0 text-sm text-muted">系列</span>
          <span class="min-w-0 flex-1 truncate text-right" :class="!seriesName && 'text-muted'">{{ seriesName || '未設定' }}</span>
          <ChevronRight :size="18" class="shrink-0 text-muted" />
        </button>
      </li>
    </ul>
  </div>

  <NamePickSheet v-model:open="tagsOpen" v-model="form.tagIds" title="標籤" multiple :items="tagItems" :create="createTag" />
  <NamePickSheet v-model:open="seriesOpen" v-model="seriesModel" title="系列" none-label="不屬於系列" :items="seriesItems" :create="createSeries" />
  <ProgressSheet v-model:open="progressOpen" v-model="progress" :no-current="!!editingId" />
  <PickSheet v-model:open="typeOpen" :model-value="form.type" title="類型" :items="workTypes(form.type)" @pick="(v: string) => setType(v)" />
  <PickSheet v-model:open="statusOpen" :model-value="status" title="狀態" :items="STATUSES" @pick="(v: string) => (status = v as Status)" />
  <PopupDialog v-model="coverMenu">
    <ul class="card w-full max-w-[21rem] divide-y divide-line overflow-hidden p-0 shadow-xl" role="menu" aria-label="編輯圖片">
      <li><button class="flex w-full items-center gap-2 px-4 py-3 text-left" role="menuitem" @click="((coverMenu = false), fileEl?.click())"><ImagePlus :size="16" />上傳圖片</button></li>
      <li><button class="flex w-full items-center gap-2 px-4 py-3 text-left" role="menuitem" @click="((coverMenu = false), coverUrl())"><Link :size="16" />貼上圖片網址</button></li>
      <li><button class="flex w-full items-center gap-2 px-4 py-3 text-left" role="menuitem" @click="((coverMenu = false), (coverSearchOpen = true))"><Search :size="16" />從搜尋換圖片</button></li>
      <li v-if="form.cover"><button class="flex w-full items-center gap-2 px-4 py-3 text-left text-danger" role="menuitem" @click="((coverMenu = false), (form.cover = undefined))"><X :size="16" />移除圖片</button></li>
    </ul>
  </PopupDialog>
  <CoverSearchSheet v-model:open="coverSearchOpen" cover-only :query="form.title" :type="form.type" @pick="applyFound" />
  <CoverSearchSheet v-model:open="searchOpen" :query="form.title" :type="form.type" @pick="applyFound" />

  <div class="mt-5 flex gap-3">
    <button v-if="editingId" class="btn btn-ghost shrink-0 px-3.5 text-sm text-danger" @click="removeThis">刪除</button>
    <button class="btn btn-primary min-w-0 flex-1" @click="save">儲存</button>
  </div>
</template>
