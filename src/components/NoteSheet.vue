<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUi } from '@/stores/ui'
import type { WorkNote } from '@/db/types'
import { ChevronLeft } from '@/lib/uiIcons'
import FuzzyDateField from './FuzzyDateField.vue'

const props = defineProps<{ note: WorkNote; isNew?: boolean; unit?: string }>()
const emit = defineEmits<{ save: [WorkNote]; remove: [] }>()
const open = defineModel<boolean>('open', { required: true })
const ui = useUi()
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

/** anything typed since it was opened */
const changed = computed(() => {
  const a = draft.value
  const b = props.note
  return (a.title ?? '') !== (b.title ?? '') || a.body !== b.body || a.date !== b.date || (a.progress ?? null) !== (b.progress ?? null)
})
/** leaving by the back arrow or Esc asks first when something would be lost */
async function close() {
  if (changed.value && !(await ui.confirm('放棄這次的修改？', { message: '還沒儲存的內容會消失。', confirmText: '放棄', danger: true }))) return
  open.value = false
}

function save() {
  emit('save', { ...draft.value, title: draft.value.title?.trim() || undefined, body: draft.value.body.trim(), progress: draft.value.progress })
  open.value = false
}

/** a full-screen editor: it follows the visible area, so the on-screen keyboard never covers the writing space */
const height = ref('100dvh')
/** iOS scrolls the page up when the keyboard opens; follow that offset so the editor stays on the visible part */
const top = ref(0)
function fit() {
  const vv = window.visualViewport
  height.value = vv ? `${vv.height}px` : '100dvh'
  top.value = vv ? vv.offsetTop : 0
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
      window.visualViewport?.addEventListener('scroll', fit)
    } else if (!v && old) {
      document.body.style.overflow = prevOverflow
      window.visualViewport?.removeEventListener('resize', fit)
      window.visualViewport?.removeEventListener('scroll', fit)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (open.value) document.body.style.overflow = prevOverflow
  window.visualViewport?.removeEventListener('resize', fit)
  window.visualViewport?.removeEventListener('scroll', fit)
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
      <!-- the outer layer always covers the whole screen, so the page never shows through the keyboard's translucent toolbar on iOS -->
      <div v-if="open" class="fixed inset-0 z-40 bg-bg">
      <div class="mx-auto flex w-full max-w-xl flex-col bg-bg" :style="{ height, transform: `translateY(${top}px)` }" role="dialog" aria-modal="true" @keydown.esc="close">
        <div class="flex min-h-14 shrink-0 items-center justify-between gap-3 px-4 py-2">
          <button class="circle-btn -ml-2.5" aria-label="返回" @click="close"><ChevronLeft :size="22" /></button>
          <h2 class="text-base font-bold">{{ isNew ? '寫' : '編輯' }}{{ label }}</h2>
          <!-- keeps the title in the middle: save lives at the bottom -->
          <span class="size-10 shrink-0 -mr-2.5" aria-hidden="true" />
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
          <input v-model="draft.title" class="input shrink-0" placeholder="標題（可不填）" />
          <textarea v-model="draft.body" class="input min-h-0 flex-1 resize-none leading-7" placeholder="想到什麼就寫什麼…" />
          <div class="mt-2 flex shrink-0 gap-3">
            <button v-if="!isNew" class="btn btn-ghost shrink-0 px-3.5 text-sm text-danger" @click="((open = false), emit('remove'))">刪除</button>
            <button class="btn btn-primary min-w-0 flex-1 disabled:opacity-40" :disabled="empty" @click="save">儲存</button>
          </div>
        </div>
      </div>
      </div>
    </Transition>
  </Teleport>
</template>
