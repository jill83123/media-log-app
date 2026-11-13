<script setup lang="ts">
import PopupDialog from './PopupDialog.vue'
import RatingList from './RatingList.vue'

const open = defineModel<boolean>('open', { required: true })
/** 0.5 – 5, or null for "no score" */
const model = defineModel<number | null>({ required: true })

function pick(v: number | null) {
  model.value = v
  open.value = false
}
</script>

<template>
  <PopupDialog v-model="open">
    <RatingList class="max-h-[calc(var(--pop-h,100dvh)-12rem)] w-full max-w-[22rem] overflow-y-auto shadow-xl" role="dialog" aria-label="評分" :model-value="model" @pick="pick" />
  </PopupDialog>
</template>
