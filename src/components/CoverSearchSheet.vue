<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { WorkType } from '@/db/types'
import { BUILTIN_TYPE_IDS, workTypes } from '@/lib/meta'
import { fileToCover } from '@/lib/image'
import { traditional } from '@/lib/chinese'
import { fetchDetail, needsProxy, proxiedImage, searchWorks, shownImage, SOURCE_LIST, sourcesFor, type SearchResult, type SourceId } from '@/lib/search'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { ChevronDown, LoaderCircle, Search, X } from '@/lib/uiIcons'
import PopupDialog from '@/components/PopupDialog.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'
import WorkCover from '@/components/WorkCover.vue'

/** looks the title up online and hands back what the user chose to take: title, author, cover */
export interface Found {
  /** the kind of work that was searched for */
  type?: WorkType
  /** how many episodes it has, when the site says */
  total?: number
  title?: string
  cover?: string
  creators?: string
  ext: Record<string, string>
}

/** coverOnly: tapping a result takes just its picture (to swap a cover that stopped loading) */
const props = defineProps<{ query: string; type: WorkType | ''; coverOnly?: boolean }>()
const emit = defineEmits<{ pick: [found: Found] }>()
const open = defineModel<boolean>('open', { required: true })
const settings = useSettings()
const ui = useUi()
/** the kind of work being looked for: it decides which sites are asked, and is saved with the work. Starts as the form's type. */
const kind = ref<WorkType | ''>('')
const kinds = computed(() => workTypes(kind.value || undefined).map((t) => ({ value: t.value, label: t.label })))
/** the names of the sources this kind will ask, in order */
const activeSources = computed(() =>
  sourcesFor(kind.value, settings.s.sourcesByType as Record<string, SourceId[]>)
    .map((id) => SOURCE_LIST.find((s) => s.id === id)?.label)
    .join('、'),
)
function pickKind(v: WorkType) {
  kind.value = v
  if (term.value.trim()) void run()
}

const results = ref<SearchResult[]>([])
const errors = ref<Record<string, string>>({})
/** the sources that were asked this time, in order; one fold each, even when it found nothing */
const queried = ref<SourceId[]>([])
const groups = computed(() => queried.value.map((id) => ({ id, items: results.value.filter((r) => r.source === id) })))
/** folds the user changed by hand; otherwise a source with results is open and an empty one is closed */
const toggled = ref<Set<string>>(new Set())
const isClosed = (g: { id: string; items: unknown[] }) => (toggled.value.has(g.id) ? !!g.items.length : !g.items.length)
function fold(id: string) {
  const s = new Set(toggled.value)
  if (!s.delete(id)) s.add(id)
  toggled.value = s
}
const loading = ref(false)
/** what is being searched for: starts as the title on the form, and can be typed over */
const term = ref("")
const searched = ref(false)
const picking = ref('')
const noWorker = computed(() => !settings.workerUrl())
const sourceLabel = (id: string) => SOURCE_LIST.find((s) => s.id === id)?.label ?? id
let ctrl: AbortController | undefined

async function run() {
  const q = term.value.trim()
  if (!q || !kind.value || noWorker.value) return
  ctrl?.abort()
  ctrl = new AbortController()
  loading.value = true
  searched.value = true
  try {
    const sources = sourcesFor(kind.value, settings.s.sourcesByType as Record<string, SourceId[]>)
    queried.value = sources
    toggled.value = new Set()
    const r = await searchWorks(settings.workerUrl(), q, BUILTIN_TYPE_IDS.includes(kind.value) ? kind.value : '', sources, ctrl.signal)
    // Bangumi and Douban answer in Simplified Chinese: show and keep Traditional
    const conv = r.results.some((x) => x.source === 'bangumi' || x.source === 'douban') ? await traditional() : (t: string) => t
    results.value = r.results.map((x) => (x.source === 'bangumi' || x.source === 'douban' ? { ...x, title: conv(x.title), creators: x.creators && conv(x.creators) } : x))
    errors.value = r.errors
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    results.value = []
    errors.value = { all: (e as Error).message }
  } finally {
    loading.value = false
  }
}
watch(open, (o) => {
  if (o) {
    term.value = props.query
    kind.value = props.type
    results.value = []
    errors.value = {}
    searched.value = false
    if (term.value.trim() && kind.value) void run()
  }
  else ctrl?.abort()
})

/** the result that was tapped, waiting for the user to say which parts to take */
const chosen = ref<{ title: string; cover?: string; creators?: string; eps?: number; ext: Record<string, string> } | null>(null)
const take = ref({ title: true, creators: true, cover: true, total: true })
const titleDiffers = computed(() => !!chosen.value && chosen.value.title.trim() !== props.query.trim())

async function pick(r: SearchResult) {
  picking.value = r.source + r.id
  // the list often lacks the author or cover; the detail page can fill them in
  const more: Partial<SearchResult> = (props.coverOnly ? !r.cover : !r.creators || !r.cover) && r.url ? await fetchDetail(settings.workerUrl(), r).catch(() => ({})) : {}
  picking.value = ''
  if (props.coverOnly) {
    const url = r.cover || more.cover
    if (!url) return ui.toast('這個結果沒有圖片', 'error')
    saving.value = true
    const cover = await keepCover(url)
    saving.value = false
    if (!cover) return
    emit('pick', { cover, ext: {} })
    open.value = false
    return
  }
  const ext: Record<string, string> = r.source === 'openlibrary' ? {} : { [r.source]: r.id }
  chosen.value = { title: r.title, cover: r.cover || more.cover, creators: r.creators || more.creators, eps: r.eps, ext }
  take.value = { title: true, creators: true, cover: true, total: true }
}
/** a picture from a site that blocks hot-linking is fetched through the Worker and kept in the work itself */
async function keepCover(url: string): Promise<string | undefined> {
  if (!needsProxy(url)) return url
  try {
    const res = await fetch(proxiedImage(settings.workerUrl(), url))
    if (!res.ok) throw new Error(String(res.status))
    return await fileToCover(new File([await res.blob()], 'cover'))
  } catch {
    ui.toast('封面下載失敗，其他資料已套用', 'error')
    return undefined
  }
}
async function apply() {
  const c = chosen.value
  if (!c || saving.value) return
  saving.value = true
  const cover = take.value.cover && c.cover ? await keepCover(c.cover) : undefined
  saving.value = false
  emit('pick', {
    type: kind.value || undefined,
    total: take.value.total ? c.eps : undefined,
    title: take.value.title && titleDiffers.value ? c.title : undefined,
    cover,
    creators: take.value.creators ? c.creators : undefined,
    ext: c.ext,
  })
  chosen.value = null
  open.value = false
}
const saving = ref(false)
</script>

<template>
  <PopupDialog :model-value="!!chosen" no-focus above @update:model-value="chosen = null">
    <div v-if="chosen" class="card w-full max-w-[22rem] space-y-4 p-5 shadow-xl" role="dialog" aria-label="套用搜尋結果">
      <div class="flex gap-3">
        <WorkCover :src="shownImage(settings.workerUrl(), chosen.cover)" :title="chosen.title" class="h-20 w-14 shrink-0" />
        <h2 class="min-w-0 flex-1 self-center text-base leading-snug font-bold">套用哪些資料？</h2>
      </div>
      <ul class="inset-divide">
        <li v-if="titleDiffers" class="flex items-center gap-3 px-1 py-3">
          <div class="min-w-0 flex-1"><p class="text-xs text-muted">標題</p><p class="truncate">{{ chosen.title }}</p></div>
          <ToggleSwitch v-model="take.title" label="標題" />
        </li>
        <li class="flex items-center gap-3 px-1 py-3">
          <div class="min-w-0 flex-1"><p class="text-xs text-muted">作者／製作</p><p class="truncate" :class="!chosen.creators && 'text-muted'">{{ chosen.creators || '查不到' }}</p></div>
          <ToggleSwitch v-model="take.creators" label="作者" :class="!chosen.creators && 'pointer-events-none opacity-40'" />
        </li>
        <li v-if="chosen.eps" class="flex items-center gap-3 px-1 py-3">
          <div class="min-w-0 flex-1"><p class="text-xs text-muted">總集數</p><p>共 {{ chosen.eps }} 集</p></div>
          <ToggleSwitch v-model="take.total" label="總集數" />
        </li>
        <li class="flex items-center gap-3 px-1 py-3">
          <div class="min-w-0 flex-1"><p class="text-xs text-muted">封面</p><p :class="!chosen.cover && 'text-muted'">{{ chosen.cover ? '搜尋到的封面' : '查不到' }}</p></div>
          <ToggleSwitch v-model="take.cover" label="封面" :class="!chosen.cover && 'pointer-events-none opacity-40'" />
        </li>
      </ul>
      <div class="grid grid-cols-2 gap-2">
        <button class="btn btn-ghost" @click="chosen = null">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="apply">{{ saving ? '處理中…' : '套用' }}</button>
      </div>
    </div>
  </PopupDialog>
  <PopupDialog v-model="open">
   <div class="card flex max-h-[calc(var(--pop-h,100dvh)-3rem)] w-full max-w-[30rem] flex-col overflow-hidden p-0 shadow-xl" role="dialog" :aria-label="coverOnly ? '搜尋圖片' : '搜尋作品資料'">
    <div class="flex items-center justify-between px-5 pt-4 pb-2">
      <h2 class="text-lg font-bold">{{ coverOnly ? '換一張圖片' : '搜尋作品資料' }}</h2>
      <button class="icon-btn -mr-2 border-0 bg-transparent text-muted" aria-label="關閉" @click="open = false"><X :size="18" /></button>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5">
    <div v-if="noWorker" class="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <p class="font-semibold">尚未設定搜尋服務</p>
      <p class="text-sm text-muted">填入 Worker 網址後才能搜尋</p>
      <RouterLink to="/settings/sync" class="btn btn-soft px-6" @click="open = false">前往設定</RouterLink>
    </div>
    <template v-else>
      <!-- one row that scrolls sideways, so it stays a single quiet line above the box -->
      <div v-drag-scroll class="scrollbar-none -mx-5 mb-3 flex gap-2 overflow-x-auto px-5 pb-1">
        <button v-for="k in kinds" :key="k.value" type="button" class="chip shrink-0" :class="kind === k.value && 'chip-on'" @click="pickKind(k.value)">{{ k.label }}</button>
      </div>
      <form class="mb-3 flex gap-2" @submit.prevent="run">
        <label class="input flex min-w-0 items-center gap-2">
          <Search :size="18" class="shrink-0 text-muted" />
          <input v-model="term" class="min-w-0 flex-1 bg-transparent outline-none" placeholder="輸入作品名稱" enterkeyhint="search" />
        </label>
        <button class="btn btn-primary shrink-0 px-5" :disabled="!term.trim() || !kind || loading">搜尋</button>
      </form>
      <p v-if="kind" class="-mt-1 mb-3 flex items-center gap-3 px-1 text-xs text-muted">
        <span class="min-w-0 truncate">來源：{{ activeSources || '未開啟任何來源' }}</span>
        <RouterLink to="/settings/sources" class="shrink-0 text-primary" @click="open = false">設定</RouterLink>
      </p>
      <p v-if="!kind && !searched && !loading" class="py-10 text-center text-sm text-muted">選好類型，輸入名稱後搜尋</p>
      <div v-if="loading" class="grid place-items-center py-12 text-muted"><LoaderCircle :size="28" class="animate-spin" /></div>
      <template v-else>
        <p v-for="(msg, src) in errors" :key="src" class="mb-2 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
          {{ src === 'all' ? msg : `${sourceLabel(String(src))} 暫時無法使用（${msg}）` }}
        </p>
        <!-- one fold per source, in the user's order, each with how many it found -->
        <section v-for="g in groups" :key="g.id" class="mb-3">
          <button class="flex w-full items-center gap-2 px-1 py-2 text-left" :class="!g.items.length && 'opacity-50'" :aria-expanded="!isClosed(g)" @click="fold(g.id)">
            <ChevronDown :size="16" class="shrink-0 text-muted transition-transform" :class="isClosed(g) && '-rotate-90'" />
            <span class="text-sm font-semibold">{{ sourceLabel(g.id) }}</span>
            <span class="text-sm text-muted">（{{ g.items.length }}）</span>
          </button>
          <ul v-if="!isClosed(g)" class="space-y-3">
            <li v-for="r in g.items" :key="r.source + r.id">
              <button class="card flex w-full gap-3 text-left transition active:scale-[0.99]" :disabled="!!picking" @click="pick(r)">
                <WorkCover :src="shownImage(settings.workerUrl(), r.cover)" :title="r.title" class="h-24 w-16 shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="font-semibold">{{ r.title }}</p>
                  <p v-if="r.creators" class="mt-1 text-xs text-muted">{{ r.creators }}</p>
                </div>
                <LoaderCircle v-if="picking === r.source + r.id" :size="18" class="animate-spin self-center text-muted" />
              </button>
            </li>
          </ul>
        </section>
      </template>
    </template>
    </div>
   </div>
  </PopupDialog>
</template>
