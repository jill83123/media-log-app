<script setup lang="ts">
import { ref } from 'vue'
import { CalendarDays } from '@/lib/uiIcons'
import { formatFuzzy } from '@/lib/date'
import FuzzyDateSheet from './FuzzyDateSheet.vue'

defineProps<{ label?: string; title?: string; placeholder?: string; dayOnly?: boolean; max?: string }>()
const model = defineModel<string>({ required: true })
const open = ref(false)
</script>

<template>
  <div>
    <span v-if="label" class="label">{{ label }}</span>
    <button type="button" class="input flex items-center justify-between gap-2 text-left" @click="open = true">
      <span :class="!model && 'text-muted'">{{ formatFuzzy(model, placeholder ?? '不填') }}</span>
      <CalendarDays :size="18" class="shrink-0 text-muted" />
    </button>
    <FuzzyDateSheet v-model:open="open" v-model="model" :title="title ?? label" :day-only="dayOnly" :max="max" />
  </div>
</template>
