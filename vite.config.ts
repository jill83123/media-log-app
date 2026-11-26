import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  // Relative base works on GitHub Pages regardless of the repository name (hash router).
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      // prompt instead of auto-reloading so an update never interrupts entering a record
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
      manifest: {
        name: '書影紀錄',
        short_name: '書影紀錄',
        description: '離線優先、可同步到 Google 雲端硬碟的書影紀錄 App',
        lang: 'zh-Hant',
        theme_color: '#fdfdfe',
        background_color: '#fdfdfe',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // reminder notifications sent by the Worker (see public/push-sw.js)
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        // the Chinese font is split into ~150 pieces (~26 MB): fetched on first use and then kept, not precached
        globIgnores: ['fonts/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // covers of saved works hosted on other sites: kept on this device only (not synced), so each picture is fetched from its site once.
        // Search-result pictures are not kept: WorkCover loads those with another referrer policy (noCache)
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.includes('/fonts/zevheitc/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-fonts',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: ({ request, sameOrigin }) => request.destination === 'image' && !sameOrigin && request.referrerPolicy === 'no-referrer',
            handler: 'CacheFirst',
            options: {
              cacheName: 'cover-images',
              // 0 = opaque (cross-site <img> without CORS)
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // listen on the LAN so a phone on the same Wi-Fi can open the dev server
  server: { host: true },
})
