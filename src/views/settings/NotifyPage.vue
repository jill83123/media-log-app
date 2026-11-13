<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { usePush } from '@/stores/push'
import PageHeader from '@/components/PageHeader.vue'
import TimePickerSheet from '@/components/TimePickerSheet.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const settings = useSettings()
const ui = useUi()
const push = usePush()
const timeOpen = ref(false)
const hasWorker = computed(() => !!settings.workerUrl())
async function toggleRemind(on: boolean) {
  try {
    if (on) await push.enable()
    else await push.disable()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}
async function testPush() {
  try {
    await push.test()
    ui.toast('已送出，稍等幾秒', 'success')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}
</script>

<template>
  <PageHeader title="每日提醒" back="/settings" />
  <p v-if="push.supported && !hasWorker" class="-mt-1 mb-3 px-1 text-xs text-muted">要先到「同步與服務」設定 Worker 網址，才能開啟提醒。</p>
  <div class="card mb-5 space-y-4">
    <p v-if="!push.supported" class="text-xs text-muted">這個瀏覽器不支援推播（iPhone 需先「加入主畫面」再從主畫面開啟）。</p>
    <template v-else>
      <div class="flex items-center justify-between"><span>開啟提醒</span><ToggleSwitch :model-value="settings.s.remindEnabled" :disabled="push.busy || !hasWorker" @update:model-value="toggleRemind" /></div>
      <template v-if="settings.s.remindEnabled">
        <button class="flex w-full items-center justify-between" @click="timeOpen = true"><span>提醒時間</span><span class="text-muted">{{ settings.s.remindTime }}</span></button>
        <button class="text-sm text-primary disabled:opacity-50" :disabled="push.busy" @click="testPush">傳一則測試通知</button>
      </template>
      <p v-if="push.error" class="text-xs text-danger">{{ push.error }}</p>
    </template>
  </div>
  <TimePickerSheet v-model:open="timeOpen" v-model="settings.s.remindTime" />
</template>
