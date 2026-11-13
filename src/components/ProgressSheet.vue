<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Minus, Plus } from '@/lib/uiIcons'
import type { Progress } from '@/db/types'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import BottomSheet from './BottomSheet.vue'
import CheckField from './CheckField.vue'

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
      <div v-if="!noCurrent">
        <span class="label">當前進度</span>
        <div class="relative">
          <button class="icon-btn absolute top-1/2 left-1 -translate-y-1/2 border-0 bg-transparent disabled:opacity-30" aria-label="減少" :disabled="draft.current <= min" @click="step('current', -1)"><Minus :size="18" /></button>
          <input class="input w-full px-12 text-center" inputmode="numeric" :value="draft.current" @input="num($event, 'current')" />
          <button class="icon-btn absolute top-1/2 right-1 -translate-y-1/2 border-0 bg-transparent" aria-label="增加" @click="step('current', 1)"><Plus :size="18" /></button>
        </div>
      </div>

      <div>
        <span class="label">總進度</span>
        <div class="relative" :class="draft.infinite && 'opacity-40'">
          <button class="icon-btn absolute top-1/2 left-1 -translate-y-1/2 border-0 bg-transparent disabled:opacity-30" aria-label="減少" :disabled="draft.infinite || draft.total <= 0" @click="step('total', -1)"><Minus :size="18" /></button>
          <input class="input w-full px-12 text-center" inputmode="numeric" :disabled="draft.infinite" :value="draft.total" @input="num($event, 'total')" />
          <button class="icon-btn absolute top-1/2 right-1 -translate-y-1/2 border-0 bg-transparent" aria-label="增加" :disabled="draft.infinite" @click="step('total', 1)"><Plus :size="18" /></button>
        </div>
      </div>

      <p v-if="error" class="px-1 text-sm text-danger">{{ error }}</p>

      <CheckField v-model="draft.infinite" class="-mt-2.5 px-1">無限進度（沒有總量，如連載中）</CheckField>

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
