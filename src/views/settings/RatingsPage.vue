<script setup lang="ts">
import { computed, ref } from 'vue'
import { DEFAULT_RATINGS, formatScore, mergeRatings, newLevelKey } from '@/lib/ratings'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { Plus } from '@/lib/uiIcons'
import PageHeader from '@/components/PageHeader.vue'
import RatingStars from '@/components/RatingStars.vue'
import PopupDialog from '@/components/PopupDialog.vue'

const settings = useSettings()
const ui = useUi()
const levels = computed(() => mergeRatings(settings.s.ratings))
const data = useData()
/** a level's key, 'new' for the add form, or null when the sheet is closed */
const editing = ref<number | 'new' | null>(null)
const draft = ref({ score: '', name: '', desc: '' })
const open = computed({ get: () => editing.value !== null, set: (v) => !v && (editing.value = null) })
const usedBy = (key: number) => data.records.filter((r) => r.rating === key).length
/** the built-in level being edited (a level the user added has no default to go back to) */
const base = computed(() => (typeof editing.value === 'number' ? DEFAULT_RATINGS.find((l) => l.value === editing.value) : undefined))
const changed = (f: 'score' | 'name' | 'desc') => !!base.value && (f === 'score' ? draft.value.score !== String(base.value.score) : draft.value[f] !== base.value[f])
function edit(v: number | 'new') {
  if (v === 'new') {
    draft.value = { score: '', name: '', desc: '' }
  } else {
    const l = levels.value.find((x) => x.value === v)!
    draft.value = { score: String(l.score), name: l.name, desc: l.desc }
  }
  editing.value = v
}
function saveLevel() {
  const score = Number(draft.value.score.replace(/,/g, '.'))
  if (draft.value.score.trim() === '' || !Number.isFinite(score)) return ui.toast('分數請輸入數字', 'error')
  const key = editing.value === 'new' ? newLevelKey(levels.value) : editing.value!
  const rest = levels.value.filter((x) => x.value !== key)
  settings.s.ratings = [...rest, { value: key, score, name: draft.value.name.trim() || String(score), desc: draft.value.desc.trim() }]
  editing.value = null
}
async function deleteLevel() {
  const key = editing.value
  if (typeof key !== 'number') return
  if (levels.value.length <= 1) return ui.toast('至少要保留一個等級', 'error')
  const n = usedBy(key)
  if (n) return ui.toast('有 ' + n + ' 筆紀錄使用這個等級，無法刪除；可以改它的分數與名稱', 'error')
  settings.s.ratings = levels.value.filter((x) => x.value !== key)
  editing.value = null
}
</script>

<template>
  <PageHeader title="評分等級" back="/settings">
    <template #right>
      <button class="inline-flex size-10 items-center justify-center text-ink transition active:scale-90" aria-label="新增等級" @click="edit('new')"><Plus :size="28" :stroke-width="2" /></button>
    </template>
  </PageHeader>
  <ul class="card mb-3 divide-y divide-line p-0">
    <li v-for="l in levels" :key="l.value">
      <button class="flex w-full items-center gap-3 px-4 py-3 text-left" @click="edit(l.value)">
        <span class="min-w-9 font-bold">{{ formatScore(l.score) }}</span>
        <RatingStars :value="l.value" :size="12" />
        <span class="min-w-0 flex-1 truncate text-sm">{{ l.name }}</span>
      </button>
    </li>
  </ul>

  <PopupDialog v-model="open">
    <div class="card max-h-[calc(var(--pop-h,100dvh)-2rem)] w-full max-w-[23rem] space-y-4 overflow-y-auto p-5 shadow-xl" role="dialog" :aria-label="editing === 'new' ? '新增等級' : '編輯等級'">
      <h2 class="text-lg leading-snug font-bold">{{ editing === 'new' ? '新增等級' : '編輯等級' }}</h2>
      <div>
        <div class="flex items-center justify-between"><span class="label">分數（顯示的數字，可自訂，例如 10、9.5、85）</span><button v-if="changed('score')" class="mb-1 shrink-0 text-xs text-primary" @click="draft.score = String(base!.score)">還原</button></div>
        <input v-model="draft.score" class="input" inputmode="decimal" />
      </div>
      <div>
        <div class="flex items-center justify-between"><span class="label">名稱</span><button v-if="changed('name')" class="mb-1 text-xs text-primary" @click="draft.name = base!.name">還原</button></div>
        <input v-model="draft.name" class="input" />
      </div>
      <div>
        <div class="flex items-center justify-between"><span class="label">說明</span><button v-if="changed('desc')" class="mb-1 text-xs text-primary" @click="draft.desc = base!.desc">還原</button></div>
        <textarea v-model="draft.desc" class="input min-h-24" />
      </div>
      <p class="text-xs text-muted">等級依分數由高到低排列；星星數依它在所有等級中的位置決定。</p>
      <div class="grid gap-2" :class="editing !== 'new' && 'grid-cols-[auto_1fr]'">
        <button v-if="editing !== 'new'" class="btn btn-ghost px-3.5 text-sm text-danger" @click="deleteLevel">刪除</button>
        <button class="btn btn-primary" @click="saveLevel">儲存</button>
      </div>
    </div>
  </PopupDialog>
</template>
