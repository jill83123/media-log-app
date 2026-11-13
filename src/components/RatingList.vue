<script setup lang="ts">
import { computed } from 'vue'
import { Check } from '@/lib/uiIcons'
import { formatScore, mergeRatings } from '@/lib/ratings'
import { useSettings } from '@/stores/settings'
import RatingStars from './RatingStars.vue'

/** 0.5 – 5, or null for "no score" */
defineProps<{ modelValue: number | null }>()
const emit = defineEmits<{ pick: [number | null] }>()
const settings = useSettings()
const levels = computed(() => mergeRatings(settings.s.ratings))
</script>

<template>
  <ul class="card divide-y divide-line p-0">
    <li>
      <button class="flex w-full items-center gap-3 px-4 py-2.5 text-left" @click="emit('pick', null)">
        <span class="w-9 shrink-0 text-lg font-bold text-muted">—</span>
        <span class="flex-1 font-semibold">不評分</span>
        <Check v-if="modelValue === null" :size="18" class="shrink-0 text-primary" />
      </button>
    </li>
    <li v-for="l in levels" :key="l.value">
      <button class="flex w-full items-start gap-3 px-4 py-2 text-left" @click="emit('pick', l.value)">
        <span class="min-w-10 shrink-0 pt-0.5 text-lg font-bold">{{ formatScore(l.score) }}</span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2">
            <RatingStars :value="l.value" :size="13" />
            <span class="font-semibold">{{ l.name }}</span>
          </span>
          <span class="mt-0.5 block text-xs leading-relaxed text-muted">{{ l.desc }}</span>
        </span>
        <Check v-if="modelValue === l.value" :size="18" class="mt-1 shrink-0 text-primary" />
      </button>
    </li>
  </ul>
</template>
