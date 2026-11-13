<script setup lang="ts">
import { computed } from 'vue'
import { starParts, starsOf } from '@/lib/ratings'

const props = withDefaults(defineProps<{ value: number | null; size?: number }>(), { size: 16 })
const parts = computed(() => (props.value == null ? null : starParts(starsOf(props.value))))
const path = 'M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.5l-5.88 3.1 1.12-6.55L2.48 9.42l6.58-.96z'
</script>

<template>
  <span class="inline-flex items-center gap-px" :aria-label="value == null ? '未評分' : `${value} 分`">
    <template v-if="parts">
      <svg v-for="i in parts.full" :key="'f' + i" :width="size" :height="size" viewBox="0 0 24 24" class="text-warn">
        <path :d="path" fill="currentColor" />
      </svg>
      <svg v-if="parts.half" :width="size" :height="size" viewBox="0 0 24 24" class="text-warn">
        <defs>
          <clipPath id="half"><rect x="0" y="0" width="12" height="24" /></clipPath>
        </defs>
        <path :d="path" fill="currentColor" opacity="0.25" />
        <path :d="path" fill="currentColor" clip-path="url(#half)" />
      </svg>
      <svg v-for="i in parts.empty" :key="'e' + i" :width="size" :height="size" viewBox="0 0 24 24" class="text-warn">
        <path :d="path" fill="currentColor" opacity="0.25" />
      </svg>
    </template>
    <template v-else>
      <svg v-for="i in 5" :key="i" :width="size" :height="size" viewBox="0 0 24 24" class="text-muted">
        <path :d="path" fill="currentColor" opacity="0.2" />
      </svg>
    </template>
  </span>
</template>
