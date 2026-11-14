<script setup lang="ts">
import { formatRating } from '@/lib/ratings'
import { Star } from '@/lib/uiIcons'

/** one star and the score, the same everywhere: the star is as tall as the digits (0.92em of star box = the digit height) and sits on their baseline, so its top and bottom line up with the digits at any font size */
defineProps<{ value: number }>()
</script>

<template>
  <span class="flex items-center gap-[0.3em] font-semibold text-warn">
    <Star :size="12" :stroke-width="0" fill="currentColor" class="size-[0.92em] shrink-0 translate-y-[0.035em]" />{{ formatRating(value) }}
  </span>
</template>
