<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { LoaderCircle, NavCalendar,NavLibrary, NavSettings, NavStats } from '@/lib/uiIcons'
import UiLayer from '@/components/UiLayer.vue'
import { useSync } from '@/stores/sync'

const sync = useSync()
const route = useRoute()
const showNav = computed(() => route.meta.nav === true)

/** icons only */
const tabs = [
  { to: '/', label: '作品', icon: NavLibrary },
  { to: '/stats', label: '統計', icon: NavStats },
  { to: '/calendar', label: '月曆', icon: NavCalendar },
  { to: '/settings', label: '設定', icon: NavSettings },
]
const isActive = (to: string) => route.path === to
</script>

<template>
  <div
    class="mx-auto min-h-dvh w-full max-w-xl px-4 pt-(--page-pt)"
    :class="showNav ? 'pb-[calc(5rem+env(safe-area-inset-bottom))]' : 'pb-[calc(2.5rem+env(safe-area-inset-bottom))]'"
  >
    <!-- the main tabs stay alive, so coming back from a work page finds them as they were (tab, filters, scroll) -->
    <RouterView v-slot="{ Component }">
      <KeepAlive include="LibraryView,StatsView,CalendarView,SettingsView">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </div>

  <nav v-if="showNav" class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]">
    <div class="mx-auto flex max-w-xl items-center px-2">
      <RouterLink
        v-for="t in tabs"
        :key="t.to"
        :to="t.to"
        :aria-label="t.label"
        :title="t.label"
        class="group flex flex-1 items-center justify-center py-3.5 transition-colors"
        :class="isActive(t.to) ? 'text-primary' : 'text-muted hover:text-ink'"
      >
        <component :is="t.icon" :size="24" :stroke-width="isActive(t.to) ? 2.2 : 1.7" class="transition group-active:scale-90" />
      </RouterLink>
    </div>
  </nav>

  <!-- first sync after opening: browsing is fine, edits are refused (sync.guardEdit) so they don't land on stale local data -->
  <Transition name="fade">
    <div v-if="sync.startupLock" class="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-80 flex justify-center" aria-live="polite">
      <div class="flex items-center gap-2 rounded-2xl border border-primary/30 bg-surface px-4 py-2.5 text-sm font-semibold text-primary shadow-(--shadow-lg)">
        <LoaderCircle :size="16" class="animate-spin" />同步中
      </div>
    </div>
  </Transition>

  <UiLayer />
</template>
