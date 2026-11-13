<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Minus, Plus } from '@/lib/uiIcons'
import type { Progress } from '@/db/types'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import BottomSheet from './BottomSheet.vue'
import ToggleSwitch from './ToggleSwitch.vue'

const props = withDefaults(defineProps<{ min?: number; noCurrent?: boolean }>(), { min: 0, noCurrent: false })
const open = defineModel<boolean>('open', { required: true })
const model = defineModel<Progress>({ required: true })
const settings = useSettings()
const ui = useUi()

const draft = ref<Progress>({ ...model.value })
watch(open, (o) => {
  if (o) draft.value = { ...model.value }
})

/** typing digits only: the browser's own number field is not used */
function num(e: Event, key: 'current' | 'total') {
  const el = e.target as HTMLInputElement
  const n = Number(el.value.replace(/[^\d]/g, '')) || 0
  draft.value[key] = n
  el.value = String(n)
}
const step = (key: 'current' | 'total', d: number) => (draft.value[key] = Math.max(key === 'current' ? props.min : 0, draft.value[key] + d))

/** the total can't end up below where you are */
const error = computed(() => {
  const d = draft.value
  if (!d.infinite && d.total > 0 && d.total < d.current) return `總進度不能小於目前進度 ${d.current}`
  return ''
})

async function customUnit() {
  const v = await ui.prompt('自訂單位', { placeholder: '例如：卷、小時' })
  if (!v) return
  draft.value.unit = v
  if (!settings.s.units.includes(v)) settings.s.units.push(v)
}

function save() {
  if (error.value) return
  model.value = { ...draft.value }
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" title="進度編輯">
    <div class="space-y-4">
      <div v-if="!noCurrent" class="card flex items-center gap-3">
        <span class="w-20 shrink-0 text-sm text-muted">當前進度</span>
        <button class="icon-btn border-0 bg-transparent disabled:opacity-30" aria-label="減少" :disabled="draft.current <= min" @click="step('current', -1)"><Minus :size="18" /></button>
        <input class="input min-w-0 text-center" inputmode="numeric" :value="draft.current" @input="num($event, 'current')" />
        <button class="icon-btn border-0 bg-transparent" aria-label="增加" @click="step('current', 1)"><Plus :size="18" /></button>
      </div>

      <div class="card flex items-center gap-3" :class="draft.infinite && 'opacity-40'">
        <span class="w-20 shrink-0 text-sm text-muted">總進度</span>
        <button class="icon-btn border-0 bg-transparent disabled:opacity-30" aria-label="減少" :disabled="draft.infinite || draft.total <= 0" @click="step('total', -1)"><Minus :size="18" /></button>
        <input class="input min-w-0 text-center" inputmode="numeric" :disabled="draft.infinite" :value="draft.total" @input="num($event, 'total')" />
        <button class="icon-btn border-0 bg-transparent" aria-label="增加" :disabled="draft.infinite" @click="step('total', 1)"><Plus :size="18" /></button>
      </div>

      <p v-if="error" class="px-1 text-sm text-danger">{{ error }}</p>

      <div class="card flex items-center gap-3">
        <span class="w-20 shrink-0 text-sm text-muted">無限進度</span>
        <span class="min-w-0 flex-1 text-sm text-muted">沒有總量，如連載中</span>
        <ToggleSwitch v-model="draft.infinite" />
      </div>

      <div>
        <span class="label">單位</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="u in settings.s.units"
            :key="u"
            class="chip"
            :class="[draft.unit === u && 'chip-on', u.length === 1 && 'min-w-9 justify-center !px-0']"
            @click="draft.unit = u"
          >
            {{ u }}
          </button>
          <button class="chip" @click="customUnit"><Plus :size="14" />自訂</button>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-primary w-full disabled:opacity-40" :disabled="!!error" @click="save">確認</button>
    </template>
  </BottomSheet>
</template>
