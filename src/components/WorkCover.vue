<script setup lang="ts">
import { useCover } from '@/lib/covers'
import { ImageOff } from '@/lib/uiIcons'

const { src, iconSize = 16 } = defineProps<{ src?: string; title?: string; iconSize?: number }>()
const url = useCover(() => src)
</script>

<template>
  <div class="overflow-hidden rounded-lg bg-surface-2">
    <img v-if="url" :src="url" class="size-full object-cover" alt="" loading="lazy" referrerpolicy="no-referrer" />
    <!-- no picture: a quiet icon only, no text -->
    <div v-else class="grid size-full place-items-center text-muted/50"><ImageOff :size="iconSize" :stroke-width="1.6" /></div>
  </div>
</template>
