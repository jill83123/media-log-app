<script setup lang="ts">
import { computed } from 'vue'
import type { Status } from '@/db/types'
import { STATUSES } from '@/lib/meta'
const props = defineProps<{ status: Status }>()
const s = computed(() => STATUSES.find((x) => x.value === props.status))
</script>

<!-- one root element, so a class passed in (e.g. absolute positioning) lands on it -->
<template>
  <span v-if="s" class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" :class="s.tone">{{ s.label }}</span>
</template>
