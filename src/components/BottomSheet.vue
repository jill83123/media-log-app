<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { X } from '@/lib/uiIcons'
import { lockScroll } from '@/lib/scrollLock'

/** `high`: for a sheet opened from a small window, which would otherwise cover it */
const { fade = true } = defineProps<{ title?: string; subtitle?: string; /** small print right under the title, inside the header */ hint?: string; fade?: boolean; high?: boolean }>()
const open = defineModel<boolean>({ required: true })

/** the fades above and below the pinned bars only make sense while the list actually scrolls */
const scrolls = ref(false)
/** scrolled all the way down: nothing is left to fade out above the bottom bar */
const atEnd = ref(true)
let watcher: ResizeObserver | undefined
function watchScroll(el: unknown) {
  watcher?.disconnect()
  if (!(el instanceof HTMLElement)) return
  const check = () => {
    scrolls.value = el.scrollHeight > el.clientHeight + 1
    atEnd.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
  }
  el.addEventListener('scroll', check, { passive: true })
  watcher = new ResizeObserver(check)
  watcher.observe(el)
  for (const c of Array.from(el.children)) watcher.observe(c)
  check()
}

/** going to another page puts the sheet away (the main tabs stay alive, so it would otherwise still be open when you come back) */
const route = useRoute()
watch(
  () => route.fullPath,
  () => (open.value = false),
)

/** keep the page behind from scrolling while the sheet is open */
// (see lib/scrollLock)
const lock = lockScroll
watch(
  open,
  (v, old) => {
    if (v && !old) lock(true)
    else if (!v && old) lock(false)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  watcher?.disconnect()
  if (open.value) lock(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 touch-none bg-black/40" :class="high ? 'z-[65]' : 'z-40'" @click="open = false" />
    </Transition>
    <Transition name="sheet">
      <!-- the title stays put and only the content below it scrolls, so a scrollbar never runs along the rounded corners -->
      <div
        v-if="open"
        :class="high ? 'z-[65]' : 'z-40'"
        class="fixed inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border-t border-line bg-bg shadow-2xl"
        role="dialog"
        aria-modal="true"
        @keydown.esc="open = false"
      >
        <!-- grab handle: a visual cue that this is a sheet you can dismiss -->
        <div class="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden="true" />
        <div class="flex shrink-0 touch-none items-center justify-between gap-3 px-5 pt-3 pb-4">
          <div class="min-w-0">
            <h2 class="text-lg font-bold">{{ title }}<span v-if="subtitle" class="ml-2 text-xs font-normal text-muted">{{ subtitle }}</span></h2>
            <p v-if="hint" class="mt-0.5 text-xs text-muted">{{ hint }}</p>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <slot name="actions" />
            <button class="icon-btn border-0 bg-transparent" aria-label="關閉" @click="open = false">
              <X :size="18" />
            </button>
          </div>
        </div>
        <div
          :ref="watchScroll"
          class="-mt-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1.5 [scrollbar-gutter:stable]"
          :class="!$slots.footer && 'pb-[max(1.25rem,env(safe-area-inset-bottom))]'"
        >
          <!-- pinned to the top of the scroll area, with a fade under it -->
          <div v-if="$slots.search" class="sticky top-0 z-10 -mx-5 bg-bg px-5 pb-3"
            :class="fade && scrolls && 'after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-gradient-to-b after:from-bg after:to-transparent'">
            <slot name="search" />
          </div>
          <slot />
          <!-- pinned to the bottom, with a fade above it -->
          <div v-if="$slots.footer" class="sticky bottom-0 z-10 -mx-5 mt-1.5 bg-bg px-5 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] "
            :class="fade && scrolls && !atEnd && 'before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-12 before:bg-gradient-to-t before:from-bg before:from-5% before:via-bg/80 before:via-40% before:to-transparent'"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
