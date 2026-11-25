<script setup lang="ts">
import { useCover } from '@/lib/covers'
import { ImageOff } from '@/lib/uiIcons'

/** noCache: a picture not saved into a work yet (search results); the service worker keeps only the ones that send no-referrer */
const { src, iconSize = 16, noCache = false } = defineProps<{ src?: string; title?: string; iconSize?: number; noCache?: boolean }>()
const url = useCover(() => src)
</script>

<template>
  <div class="overflow-hidden rounded-lg bg-surface-2">
    <img v-if="url" :src="url" draggable="false" class="size-full object-cover" alt="" loading="lazy" :referrerpolicy="noCache ? 'same-origin' : 'no-referrer'" />
    <!-- no picture: a quiet icon only, no text -->
    <div v-else class="grid size-full place-items-center text-muted/50"><ImageOff :size="iconSize" :stroke-width="1.6" /></div>
  </div>
</template>
