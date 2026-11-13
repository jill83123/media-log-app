<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { lockScroll } from '@/lib/scrollLock'

/**
 * A small window in the middle of the screen, for things too small for a sheet: a name, a number, a short list.
 * The content (usually a `.card`) comes in the slot; tapping outside closes it.
 * It is centred in the part of the screen that can actually be seen: on a phone the on-screen keyboard shrinks the visual
 * viewport, so the window moves up to sit above the keyboard; on a computer there is no keyboard and it stays in the middle.
 * `--pop-h` is that visible height, for a card's own max-height. The first field is focused when it opens (unless `no-focus`).
 */
const props = defineProps<{ noFocus?: boolean; above?: boolean }>()
const open = defineModel<boolean>({ required: true })
const root = ref<HTMLElement>()
let locked = false

const box = ref({ top: 0, height: window.innerHeight })
function fit() {
  const v = window.visualViewport
  box.value = v ? { top: v.offsetTop, height: v.height } : { top: 0, height: window.innerHeight }
}
function listen(on: boolean) {
  const v = window.visualViewport
  const act = on ? 'addEventListener' : 'removeEventListener'
  v?.[act]('resize', fit)
  v?.[act]('scroll', fit)
  window[act]('resize', fit)
}
watch(
  open,
  async (o) => {
    listen(o)
    if (o !== locked) {
      locked = o
      lockScroll(o)
    }
    if (!o) return
    fit()
    if (props.noFocus) return
    await nextTick()
    root.value?.querySelector<HTMLElement>('input, textarea')?.focus()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  listen(false)
  if (locked) lockScroll(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        ref="root"
        class="fixed inset-x-0 flex items-center justify-center bg-black/30 p-4" :class="above ? 'z-[70]' : 'z-[60]'"
        :style="{ top: `${box.top}px`, height: `${box.height}px`, '--pop-h': `${box.height}px` }"
        @click.self="open = false"
        @keydown.esc="open = false"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>
