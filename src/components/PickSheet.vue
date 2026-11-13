<script setup lang="ts" generic="T extends string | number">
import { Check, X } from '@/lib/uiIcons'
import PopupDialog from './PopupDialog.vue'

export interface PickItem<V> {
  value: V
  label: string
  sub?: string
  icon?: string
  color?: string
  /** the choice of nothing: a grey cross in an outlined tile, no fill */
  none?: boolean
}

defineProps<{ title: string; items: PickItem<T>[]; empty?: string }>()
const open = defineModel<boolean>('open', { required: true })
const model = defineModel<T | undefined>({ required: true })
const emit = defineEmits<{ pick: [value: T] }>()

function choose(v: T, close: () => void) {
  model.value = v
  emit('pick', v)
  close()
}
</script>

<template>
  <PopupDialog v-model="open" no-focus>
    <div class="card max-h-[calc(var(--pop-h,100dvh)-10rem)] w-full max-w-[22rem] overflow-y-auto p-0 shadow-xl" role="dialog" :aria-label="title">
    <p v-if="!items.length" class="py-6 text-center text-sm text-muted">{{ empty ?? '沒有選項' }}</p>
    <ul class="divide-y divide-line" v-else>
      <li v-for="it in items" :key="String(it.value)">
        <button
          class="flex w-full items-center gap-3 px-4 py-3 text-left"
          @click="choose(it.value, () => (open = false))"
        >
          <span v-if="it.none" class="grid size-[38px] shrink-0 place-items-center rounded-[11px] text-muted ring-1 ring-muted/40"><X :size="20" /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ it.label }}</span>
            <span v-if="it.sub" class="block truncate text-xs text-muted">{{ it.sub }}</span>
          </span>
          <Check v-if="it.value === model" :size="18" class="text-primary" />
        </button>
      </li>
    </ul>
    <slot />
    </div>
  </PopupDialog>
</template>
