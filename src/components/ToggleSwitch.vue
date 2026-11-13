<script setup lang="ts">
defineProps<{ label?: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="model"
    :aria-label="label"
    class="group relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40"
    :class="model ? 'bg-primary' : 'bg-muted/35'"
    @click="model = !model"
  >
    <span
      class="inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-active:w-6"
      :class="model ? 'translate-x-6 group-active:translate-x-5' : 'translate-x-1'"
    />
  </button>
</template>
