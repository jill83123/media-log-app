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
      <button class="flex w-full items-center gap-3 px-4 py-2 text-left" @click="emit('pick', null)">
        <span class="min-w-10 shrink-0 text-lg font-bold text-muted">—</span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2">
            <span class="font-semibold">不評分</span>
            <RatingStars :value="null" :size="13" />
          </span>
          <span class="block text-xs leading-normal text-muted">先不打分數，之後再評。</span>
        </span>
        <Check v-if="modelValue === null" :size="18" class="shrink-0 self-center text-primary" />
      </button>
    </li>
    <li v-for="l in levels" :key="l.value">
      <button class="flex w-full items-center gap-3 px-4 py-2 text-left" @click="emit('pick', l.value)">
        <span class="min-w-10 shrink-0 text-lg font-bold">{{ formatScore(l.score) }}</span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2">
            <span class="font-semibold">{{ l.name }}</span>
            <RatingStars :value="l.value" :size="13" />
          </span>
          <span class="block text-xs leading-normal text-muted">{{ l.desc }}</span>
        </span>
        <Check v-if="modelValue === l.value" :size="18" class="shrink-0 self-center text-primary" />
      </button>
    </li>
  </ul>
</template>
