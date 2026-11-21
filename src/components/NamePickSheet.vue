<script setup lang="ts">
import { ref } from 'vue'
import { Check, Plus } from '@/lib/uiIcons'
import BottomSheet from './BottomSheet.vue'

/** Pick from a list of named things and create new ones on the spot (tags, categories, series). */
const props = defineProps<{
  title: string
  items: { id: string; name: string; indent?: number }[]
  multiple?: boolean
  noneLabel?: string
  /** small print right under the title */
  hint?: string
  create: (name: string) => Promise<string>
}>()
const open = defineModel<boolean>('open', { required: true })
const model = defineModel<string[]>({ required: true })
const text = ref('')

function toggle(id: string) {
  if (props.multiple) model.value = model.value.includes(id) ? model.value.filter((x) => x !== id) : [...model.value, id]
  else {
    model.value = [id]
    open.value = false
  }
}
async function add() {
  const name = text.value.trim()
  if (!name) return
  const id = await props.create(name)
  text.value = ''
  if (props.multiple) model.value = [...model.value, id]
  else {
    model.value = [id]
    open.value = false
  }
}
function none() {
  model.value = []
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" :title="title" :hint="hint">
    <form class="mb-3 flex gap-2" @submit.prevent="add">
      <input v-model="text" class="input" placeholder="輸入名稱" />
      <button class="btn btn-primary shrink-0 px-4" :disabled="!text.trim()"><Plus :size="18" /></button>
    </form>
    <ul v-if="items.length || noneLabel" class="card divide-y divide-line p-0">
      <li v-if="noneLabel">
        <button class="flex w-full items-center px-4 py-3 text-left text-base text-muted" @click="none">
          <span class="flex-1">{{ noneLabel }}</span><Check v-if="!model.length" :size="18" class="text-primary" />
        </button>
      </li>
      <li v-for="it in items" :key="it.id">
        <button class="flex w-full items-center px-4 py-3 text-left text-base" :style="{ paddingLeft: `${1 + (it.indent ?? 0) * 1.25}rem` }" @click="toggle(it.id)">
          <span class="flex-1">{{ it.name }}</span>
          <Check v-if="model.includes(it.id)" :size="18" class="text-primary" />
        </button>
      </li>
    </ul>
  </BottomSheet>
</template>
