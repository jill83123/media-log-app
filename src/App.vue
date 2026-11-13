<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { NavCalendar, NavLibrary, NavSettings, NavStats } from '@/lib/uiIcons'
import UiLayer from '@/components/UiLayer.vue'

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

  <UiLayer />
</template>
