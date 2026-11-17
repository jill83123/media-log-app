import type { WorkType } from '@/db/types'
import { mergeTypes, setTypes, type TypeDef } from '@/lib/meta'
import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { uid } from '@/lib/id'
import { themeById } from '@/lib/themes'
import { WORKER_URL } from '@/lib/search'
import { mergeRatings, setRatingLevels, type RatingLevel } from '@/lib/ratings'

export interface LocalSettings {
  theme: 'system' | 'light' | 'dark'
  /** accent colour, an id from lib/themes */
  themeColor: string
  /** settings revision for the one-time colour reset */
  themeV?: number
  /** the user's edits to the 10 rating levels (see lib/ratings) */
  ratings: Partial<RatingLevel>[]
  /** the user's list of work types: order, hidden ones, ones they added (see lib/meta) */
  types: Partial<TypeDef>[]
  /** progress units offered when creating a record */
  units: string[]
  deviceId: string
  /** Cloudflare Worker: search proxy, Google sign-in and push (empty = build-time default) */
  workerUrl: string
  /** per kind of work: the search sources that are on, in the user's order (a type not listed uses the default list, see lib/search) */
  sourcesByType: Record<string, string[]>
  /** the data file in the app's hidden Drive folder */
  dataFileId: string
  lastSyncAt: number
  /** when each shared setting (ratings, units) was last changed on any device */
  sharedAt: Record<string, number>
  /** reminders (see lib/reminders) */
  remindEnabled: boolean
  /** HH:mm */
  remindTime: string
  /** tells this device apart, and links every device of one person for push */
  pushGroup: string
  /** how the works page lays works out */
  libraryView: 'grid' | 'timeline'
  /** how a series page lays its works out */
  seriesView: 'list' | 'grid'
  /** how the list of all series (in the settings) is shown */
  seriesListView: 'list' | 'grid'
  /** what the works page orders its works by, and which way ('down' = newest, best, first in the alphabet) */
  librarySort: 'time' | 'rating' | 'title'
  libraryDir: 'down' | 'up'
  /** what the series tab orders the series by: the order set by hand, or by score / name / number of works; and which way */
  seriesSort: 'time' | 'custom' | 'rating' | 'name' | 'count'
  seriesDir: 'down' | 'up'
  /** the kind of work the works page was last showing; '' = all */
  libraryType: WorkType | ''
}

const KEY = 'ml.settings'

const defaults: LocalSettings = {
  theme: 'system',
  themeColor: 'brown',
  ratings: [],
  types: [],
  units: ['集', '話', '章', '頁', '%', '冊'],
  deviceId: '',
  workerUrl: '',
  sourcesByType: {},
  dataFileId: '',
  lastSyncAt: 0,
  sharedAt: {},
  remindEnabled: false,
  remindTime: '21:00',
  pushGroup: '',
  libraryView: 'timeline',
  seriesView: 'list',
  seriesListView: 'list',
  librarySort: 'time',
  libraryDir: 'down',
  seriesSort: 'time',
  seriesDir: 'down',
  // the list starts on one type (the first built-in one) rather than everything mixed; 全部作品 is one tap away
  libraryType: 'anime',
}

function read(): LocalSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    // the default colour used to be blue and could not be told from a pick: once, everyone starts on brown again
    if (saved.themeV !== 2) Object.assign(saved, { themeColor: 'brown', themeV: 2 })
    // the orders were once one pick each ('recent', 'ratingDesc'…): anything that is no longer one starts from the default
    if (!['time', 'rating', 'title'].includes(saved.librarySort)) delete saved.librarySort
    if (!['time', 'custom', 'rating', 'name', 'count'].includes(saved.seriesSort)) delete saved.seriesSort
    // the series list now starts on the time it was changed: once, an earlier default of the hand-made order is dropped
    if (saved.seriesSortV !== 2) {
      delete saved.seriesSort
      saved.seriesSortV = 2
    }
    return { ...defaults, ...saved } as LocalSettings
  } catch {
    return { ...defaults }
  }
}

export const useSettings = defineStore('settings', () => {
  const s = reactive<LocalSettings>(read())
  if (!s.deviceId) s.deviceId = uid()

  watch(
    s,
    () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(s))
      } catch {
        /* storage blocked: settings just last for this visit */
      }
    },
    { deep: true },
  )

  const media = matchMedia('(prefers-color-scheme: dark)')
  function applyTheme() {
    const dark = s.theme === 'dark' || (s.theme === 'system' && media.matches)
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    const t = themeById(s.themeColor)
    root.style.setProperty('--primary', dark ? t.dark : t.color)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#1c1d1f' : '#fdfdfe')
  }
  watch(() => [s.theme, s.themeColor], applyTheme, { immediate: true })
  media.addEventListener('change', applyTheme)

  // every screen shows the user's own rating numbers
  watch(() => s.ratings, () => setRatingLevels(mergeRatings(s.ratings)), { deep: true, immediate: true })

  watch(() => s.types, () => setTypes(mergeTypes(s.types)), { deep: true, immediate: true })

  // ratings, types and units are shared between devices, so remember when they last changed
  let applying = false
  watch(
    () => s.types,
    () => !applying && (s.sharedAt.types = Date.now()),
    { deep: true },
  )
  watch(
    () => s.ratings,
    () => !applying && (s.sharedAt.ratings = Date.now()),
    { deep: true },
  )
  watch(
    () => s.units,
    () => !applying && (s.sharedAt.units = Date.now()),
    { deep: true },
  )
  const SHARED = ['ratings', 'units', 'types'] as const
  /** the shared settings with their timestamps, for the sheet */
  const sharedValues = () => SHARED.map((k) => ({ key: k, updatedAt: s.sharedAt[k] ?? 0, value: s[k] }))
  /** take a shared setting from the sheet (used when its copy is newer) */
  function applyShared(key: string, value: unknown, updatedAt: number) {
    if (!(SHARED as readonly string[]).includes(key) || !Array.isArray(value)) return
    applying = true
    ;(s as unknown as Record<string, unknown>)[key] = value
    s.sharedAt[key] = updatedAt
    // watchers run after this tick; release the flag then
    queueMicrotask(() => setTimeout(() => (applying = false), 0))
  }

  if (!s.pushGroup) s.pushGroup = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')

  /** the Worker to talk to: the one typed in settings, else the one the build was made for */
  const workerUrl = () => (s.workerUrl.trim() || WORKER_URL).replace(/\/+$/, '')

  return { s, workerUrl, sharedValues, applyShared }
})
