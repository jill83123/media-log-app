import { reactive } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'

/** what the last navigation did to the scroll position, for pages that place themselves */
export const scroll = reactive({
  /** put back where it was (Back/Forward) */
  restored: false,
  /** counts openings of the calendar that should land on the current month */
  calendar: 0,
})

export default createRouter({
  history: createWebHashHistory(),
  // going back restores where the page was; a new page starts at the top; the calendar places itself on the current month
  scrollBehavior: (to, _from, saved) => {
    scroll.restored = !!saved
    if (saved) return { ...saved, behavior: 'instant' }
    if (to.path === '/calendar') {
      scroll.calendar++
      return false
    }
    return { top: 0, behavior: 'instant' }
  },
  routes: [
    { path: '/', component: () => import('@/views/LibraryView.vue'), meta: { nav: true } },
    { path: '/stats', component: () => import('@/views/StatsView.vue'), meta: { nav: true } },
    { path: '/calendar', component: () => import('@/views/CalendarView.vue'), meta: { nav: true } },
    { path: '/settings', component: () => import('@/views/SettingsView.vue'), meta: { nav: true } },
    { path: '/settings/types', component: () => import('@/views/settings/TypesPage.vue') },
    { path: '/settings/ratings', component: () => import('@/views/settings/RatingsPage.vue') },
    { path: '/settings/appearance', component: () => import('@/views/settings/AppearancePage.vue') },
    { path: '/settings/sources', component: () => import('@/views/settings/SourcesPage.vue') },
    { path: '/settings/notify',component: () => import('@/views/settings/NotifyPage.vue') },
    { path: '/settings/sync', component: () => import('@/views/settings/SyncPage.vue') },
    { path: '/work/new', component: () => import('@/views/WorkEditView.vue') },
    { path: '/work/:id', component: () => import('@/views/WorkView.vue') },
    { path: '/work/:id/edit', component: () => import('@/views/WorkEditView.vue') },
    { path: '/series/:id', component: () => import('@/views/SeriesView.vue') },
    { path: '/manage/tags', component: () => import('@/views/ManageView.vue') },
    { path: '/dev', component: () => import('@/views/DevView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
