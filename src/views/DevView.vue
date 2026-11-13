<script setup lang="ts">
import { ref } from 'vue'
import type { Progress } from '@/db/types'
import { formatSpan } from '@/lib/date'
import { loadDemo, resetDemo } from '@/lib/demo'
import { formatRating } from '@/lib/ratings'
import { useUi } from '@/stores/ui'
import FuzzyDateField from '@/components/FuzzyDateField.vue'
import ProgressSheet from '@/components/ProgressSheet.vue'
import RatingSheet from '@/components/RatingSheet.vue'
import RatingStars from '@/components/RatingStars.vue'
import SelectField from '@/components/SelectField.vue'

/** component playground, reachable at #/dev */
const ui = useUi()
const start = ref('')
const end = ref('')
const rating = ref<number | null>(4.5)
const ratingOpen = ref(false)
const progress = ref<Progress>({ current: 6, total: 100, unit: '%', infinite: false })
const progressOpen = ref(false)
const pick = ref('anime')
const types = [
  { value: 'anime', label: '動畫' },
  { value: 'movie', label: '電影' },
  { value: 'book', label: '書籍' },
]
</script>

<template>
  <h1 class="mb-4 text-2xl font-bold">元件預覽</h1>
  <div class="space-y-4">
    <FuzzyDateField v-model="start" label="開始日期" />
    <FuzzyDateField v-model="end" label="結束日期" />
    <p class="text-sm text-muted">共花：{{ formatSpan(start, end) || '—' }}</p>
    <button class="input flex items-center justify-between" @click="ratingOpen = true">
      <span>評分 {{ formatRating(rating) }}</span><RatingStars :value="rating" />
    </button>
    <RatingSheet v-model:open="ratingOpen" v-model="rating" />
    <button class="input text-left" @click="progressOpen = true">
      進度 {{ progress.current }} / {{ progress.infinite ? '∞' : progress.total }} {{ progress.unit }}
    </button>
    <ProgressSheet v-model:open="progressOpen" v-model="progress" />
    <SelectField v-model="pick" title="類型" :items="types" />
    <div class="flex gap-2">
      <button class="btn btn-primary" @click="ui.toast('已儲存', 'success')">Toast</button>
      <button class="btn btn-ghost" @click="ui.confirm('確定刪除？', { message: '無法復原', danger: true })">對話框</button>
      <button class="btn btn-ghost" @click="loadDemo().then(() => ui.toast('已載入示範資料', 'success'))">載入示範資料</button>
      <button class="btn btn-ghost text-danger" @click="resetDemo().then(() => ui.toast('已重置並載入示範資料', 'success'))">重置資料</button>
    </div>
  </div>
</template>
