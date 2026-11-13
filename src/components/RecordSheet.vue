<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Rec } from '@/db/types'
import { logChange, put } from '@/lib/repo'
import { today } from '@/lib/date'
import { formatRating } from '@/lib/ratings'
import { STATUSES } from '@/lib/meta'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { Check, Plus } from '@/lib/uiIcons'
import PopupDialog from './PopupDialog.vue'
import FuzzyDateField from './FuzzyDateField.vue'
import RatingList from './RatingList.vue'
import RatingStars from './RatingStars.vue'

const props = defineProps<{ record: Rec; removable?: boolean }>()
const emit = defineEmits<{ remove: [] }>()
const open = defineModel<boolean>('open', { required: true })
const draft = ref<Rec>({ ...props.record })
const settings = useSettings()
const ui = useUi()
/** the rating list pops up over the sheet as a small window */
const ratingOpen = ref(false)
/** the units pop up the same way */
const unitOpen = ref(false)

/** the total is typed freely; it only may not end up below where you are */
function setTotal(n: number) {
  draft.value.progress.total = Math.max(0, n)
}
const digits = (e: Event) => Number((e.target as HTMLInputElement).value.replace(/\D/g, '')) || 0
const progressError = computed(() => {
  const p = draft.value.progress
  return !p.infinite && p.total > 0 && p.total < p.current ? `總進度不能小於目前進度 ${p.current}` : ''
})
async function customUnit() {
  unitOpen.value = false
  const v = await ui.prompt('自訂單位', { placeholder: '例如：卷、小時' })
  if (!v) return
  draft.value.progress.unit = v
  if (!settings.s.units.includes(v)) settings.s.units.push(v)
}

watch(open, (o) => {
  if (o) {
    draft.value = { ...props.record, progress: { ...props.record.progress } }
    ratingOpen.value = false
    unitOpen.value = false
  }
})

/** moving to 在看 / 看完 fills a blank date with today, the way the quick buttons do */
function setStatus(s: Rec['status']) {
  draft.value.status = s
  if (!draft.value.start) draft.value.start = today()
  if (s === 'done' && !draft.value.end) draft.value.end = today()
  if (s === 'done' && !draft.value.progress.infinite && draft.value.progress.total) draft.value.progress.current = draft.value.progress.total
}

async function save() {
  // the draft is a reactive proxy, which IndexedDB can't clone: save a plain copy
  await put('records', JSON.parse(JSON.stringify(draft.value)))
  if (draft.value.progress.current !== props.record.progress.current) await logChange(draft.value, props.record.progress.current, draft.value.progress.current)
  open.value = false
}
</script>

<template>
  <PopupDialog v-model="open" no-focus>
    <div class="card max-h-[calc(var(--pop-h,100dvh)-2rem)] w-full max-w-[23rem] space-y-4 overflow-y-auto p-5 shadow-xl" role="dialog" aria-label="編輯記錄">
      <h2 class="pb-1 text-lg leading-snug font-bold">編輯記錄<span class="ml-1.5 text-sm font-normal text-muted">（{{ draft.round }} 刷）</span></h2>
      <div>
        <span class="label">狀態</span>
        <div class="flex flex-wrap gap-2">
          <button v-for="s in STATUSES" :key="s.value" class="chip" :class="draft.status === s.value && 'chip-on'" @click="setStatus(s.value)">{{ s.label }}</button>
        </div>
      </div>

      <div>
        <span class="label">評分</span>
        <button class="input flex items-center justify-between" @click="ratingOpen = true">
          <span :class="draft.rating == null && 'text-muted'">{{ formatRating(draft.rating) }}</span>
          <RatingStars :value="draft.rating" />
        </button>
      </div>

      <div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <span class="label">總進度</span>
            <input class="input disabled:opacity-40" inputmode="numeric" :disabled="draft.progress.infinite" :value="draft.progress.total" @input="setTotal(digits($event))" />
          </div>
          <div>
            <span class="label">單位</span>
            <button class="input flex w-full items-center justify-between" @click="unitOpen = true">
              <span class="truncate">{{ draft.progress.unit }}</span>
            </button>
          </div>
        </div>
        <button type="button" role="checkbox" :aria-checked="draft.progress.infinite" class="-mb-1 mt-2 flex items-center gap-2 px-1 text-xs text-muted" @click="draft.progress.infinite = !draft.progress.infinite">
          <span class="flex size-4 items-center justify-center rounded border" :class="draft.progress.infinite ? 'border-primary bg-primary text-white' : 'border-line bg-surface'"><Check v-if="draft.progress.infinite" :size="12" /></span>
          無限進度（連載中）
        </button>
        <p v-if="progressError" class="mt-1.5 px-1 text-sm text-danger">{{ progressError }}</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <FuzzyDateField v-model="draft.start" label="開始" />
        <FuzzyDateField v-model="draft.end" label="結束" />
      </div>

      <div class="flex gap-3 pt-1">
        <button v-if="removable" class="btn btn-ghost shrink-0 px-3.5 text-sm text-danger" @click="((open = false), emit('remove'))">刪除</button>
        <button class="btn btn-primary min-w-0 flex-1 disabled:opacity-40" :disabled="!!progressError" @click="save">儲存</button>
      </div>
    </div>
  </PopupDialog>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open && unitOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" @click.self="unitOpen = false" @keydown.esc="unitOpen = false">
        <ul class="card max-h-[calc(var(--pop-h,100dvh)-10rem)] w-full max-w-[22rem] divide-y divide-line overflow-y-auto p-0 shadow-xl" role="dialog" aria-label="單位">
          <li v-for="u in settings.s.units" :key="u">
            <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="((draft.progress.unit = u), (unitOpen = false))">
              <span class="font-semibold">{{ u }}</span>
              <Check v-if="draft.progress.unit === u" :size="18" class="shrink-0 text-primary" />
            </button>
          </li>
          <li>
            <button class="flex w-full items-center gap-1.5 px-4 py-3 text-left text-muted" @click="customUnit"><Plus :size="14" />自訂</button>
          </li>
        </ul>
      </div>
    </Transition>
  </Teleport>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open && ratingOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" @click.self="ratingOpen = false" @keydown.esc="ratingOpen = false">
        <RatingList class="max-h-[calc(var(--pop-h,100dvh)-12rem)] w-full max-w-[22rem] overflow-y-auto shadow-xl" role="dialog" aria-label="評分" :model-value="draft.rating" @pick="((draft.rating = $event), (ratingOpen = false))" />
      </div>
    </Transition>
  </Teleport>
</template>
