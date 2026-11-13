<script setup lang="ts">
import { Check } from '@/lib/uiIcons'

defineProps<{ disabled?: boolean }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="model"
    :disabled="disabled"
    class="flex items-center gap-2 text-left disabled:opacity-40"
    @click="model = !model"
  >
    <span
      class="grid size-[1.125rem] shrink-0 place-items-center rounded-md border transition-colors"
      :class="model ? 'border-primary bg-primary text-white' : 'border-line bg-surface'"
    >
      <Check v-if="model" :size="13" :stroke-width="3" />
    </span>
    <span class="text-xs leading-none tracking-wide text-muted"><slot /></span>
  </button>
</template>
