import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useSettings } from './stores/settings'
import { useData } from './stores/data'
import { useSync } from './stores/sync'
import { usePush } from './stores/push'
import { vDragScroll } from './lib/dragScroll'
import { initUpdater } from './lib/updater'

const app = createApp(App)
app.use(createPinia())
app.directive('drag-scroll', vDragScroll)
useSettings()
useData().start()
useSync().init()
usePush().init()
app.use(router)
app.mount('#app')
initUpdater()

// iOS Safari can still pinch-zoom despite the viewport tag: swallow its gesture events
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault())
