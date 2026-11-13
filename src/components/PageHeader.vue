<script setup lang="ts">
import { ChevronLeft } from '@/lib/uiIcons'
import { useRouter } from 'vue-router'

const props = defineProps<{
  title?: string
  subtitle?: string
  back?: string
  hideBack?: boolean
}>()
const router = useRouter()

function goBack() {
  if (props.back) router.push(props.back)
  else if (window.history.state?.back) router.back()
  else router.push('/')
}
</script>

<template>
  <header class="relative -mx-4 mb-2 flex min-h-14 items-center gap-3 bg-bg px-4 py-2">
    <div class="flex min-w-fit flex-1 basis-0 items-center gap-2">
      <button v-if="!hideBack" class="circle-btn -ml-2.5" aria-label="返回" @click="goBack">
        <ChevronLeft :size="22" />
      </button>
      <slot name="left" />
    </div>
    <div class="min-w-0 text-center">
      <h1 class="truncate text-xl font-bold">
        <slot name="title">{{ title }}</slot>
      </h1>
      <p v-if="subtitle" class="truncate text-xs text-muted">{{ subtitle }}</p>
    </div>
    <div class="-mr-2.5 flex min-w-fit flex-1 basis-0 items-center justify-end gap-2">
      <slot name="right" />
    </div>
  </header>
</template>
