<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WorkType } from '@/db/types'
import { workTypes } from '@/lib/meta'
import { eventsOf, itemsOf } from '@/lib/stats'
import { useData } from '@/stores/data'
import PickSheet from '@/components/PickSheet.vue'
import { ChevronDown } from '@/lib/uiIcons'
import CalendarTab from '@/components/stats/CalendarTab.vue'

const data = useData()
/** one type at a time, starting on the first in the user's order: there is no 全部作品 here */
const types = ref<WorkType[]>(workTypes()[0] ? [workTypes()[0]!.value] : [])
const items = computed(() => itemsOf(data.works, data.records, types.value))
const allEvents = computed(() => eventsOf(items.value, data.notes, data.progressLogs))

/** one type at a time, picked from a dropdown ('' = all) */
const typeId = computed<string>({
  get: () => types.value[0] ?? '',
  set: (v) => (types.value = v ? [v] : []),
})
const typeItems = computed(() => workTypes(typeId.value).map((t) => ({ value: t.value as string, label: t.label })))
const typeOpen = ref(false)
const typeTitle = computed(() => typeItems.value.find((t) => t.value === typeId.value)?.label ?? '日曆')
</script>

<template>
  <header class="sticky-header">
    <button class="relative text-xl font-bold" aria-label="選擇作品類型" @click="typeOpen = true">{{ typeTitle }}<ChevronDown :size="18" class="absolute top-1/2 left-full ml-1 -translate-y-1/2 text-muted" /></button>
    <PickSheet v-model:open="typeOpen" :model-value="typeId" title="作品類型" :items="typeItems" @pick="(v: string) => (typeId = v)" />
  </header>
  <CalendarTab :events="allEvents" />
</template>
