<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { WorkNote } from '@/db/types'
import FuzzyDateField from './FuzzyDateField.vue'

const props = defineProps<{ note: WorkNote; isNew?: boolean; unit?: string }>()
const emit = defineEmits<{ save: [WorkNote]; remove: [] }>()
const open = defineModel<boolean>('open', { required: true })
const draft = ref<WorkNote>({ ...props.note })

watch(open, (o) => {
  if (o) draft.value = { ...props.note }
})

/** a note needs some writing and a date */
const label = computed(() => (draft.value.kind === 'note' ? '筆記' : '心得'))
const empty = computed(() => (!draft.value.body.trim() && !draft.value.title?.trim()) || !draft.value.date)

/** typed as digits; empty means "not said" */
const progressText = computed({
  get: () => (draft.value.progress == null ? '' : String(draft.value.progress)),
  set: (v: string) => {
    const d = v.replace(/\D/g, '')
    draft.value.progress = d === '' ? undefined : Number(d)
  },
})

function save() {
  emit('save', { ...draft.value, title: draft.value.title?.trim() || undefined, body: draft.value.body.trim(), progress: draft.value.progress })
  open.value = false
}

/** a full-screen editor: it follows the visible area, so the on-screen keyboard never covers the writing space */
const height = ref('100dvh')
function fit() {
  height.value = window.visualViewport ? `${window.visualViewport.height}px` : '100dvh'
}
let prevOverflow = ''
watch(
  open,
  (v, old) => {
    if (v && !old) {
      prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      fit()
      window.visualViewport?.addEventListener('resize', fit)
    } else if (!v && old) {
      document.body.style.overflow = prevOverflow
      window.visualViewport?.removeEventListener('resize', fit)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (open.value) document.body.style.overflow = prevOverflow
  window.visualViewport?.removeEventListener('resize', fit)
})
const route = useRoute()
watch(
  () => route.fullPath,
  () => (open.value = false),
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-x-0 top-0 z-40 mx-auto flex w-full max-w-xl flex-col bg-bg" :style="{ height }" role="dialog" aria-modal="true" @keydown.esc="open = false">
        <div class="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <button class="px-1 text-base text-muted" @click="open = false">取消</button>
          <h2 class="text-base font-bold">{{ isNew ? '寫' : '編輯' }}{{ label }}</h2>
          <button class="px-1 text-base font-bold text-primary disabled:opacity-40" :disabled="empty" @click="save">儲存</button>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input v-model="draft.title" class="input shrink-0" placeholder="標題（可不填）" />
          <textarea v-model="draft.body" class="input min-h-0 flex-1 resize-none leading-7" placeholder="想到什麼就寫什麼…" />
          <div class="grid shrink-0 gap-3" :class="draft.kind === 'note' && 'grid-cols-2'">
            <FuzzyDateField v-model="draft.date" label="日期" />
            <label v-if="draft.kind === 'note'" class="block">
              <span class="label">看到哪（選填）</span>
              <span class="relative block">
                <input v-model="progressText" class="input" :class="unit && 'pr-12'" inputmode="numeric" placeholder="不填" />
                <span v-if="unit" class="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-muted">{{ unit }}</span>
              </span>
            </label>
          </div>
          <button v-if="!isNew" class="btn btn-ghost shrink-0 text-danger" @click="((open = false), emit('remove'))">刪除</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
