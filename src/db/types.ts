import type { FuzzyDate } from '@/lib/date'

/** Every synced row has these; deleting only sets `deleted` so other devices learn about it. */
export interface Base {
  id: string
  updatedAt: number
  deleted?: boolean
}

/** a type's id: one of the built-in ones ('anime', 'movie'...) or one the user added */
export type WorkType = string

export type Status = 'todo' | 'doing' | 'paused' | 'done' | 'dropped'

export interface Progress {
  current: number
  /** 0 when unknown */
  total: number
  /** 集 / 話 / 頁 / % / 章 … */
  unit: string
  /** no known end (an ongoing series): the total is ignored */
  infinite: boolean
}

export interface ExternalIds {
  bangumi?: string
  douban?: string
  goodreads?: string
  books?: string
  isbn?: string
  gamer?: string
  bookwalker?: string
}

export interface Work extends Base {
  type: WorkType
  title: string
  originalTitle?: string
  /** a web address, or `drive:<fileId>` for a cover the user uploaded */
  cover?: string
  creators?: string
  year?: string
  summary?: string
  ext?: ExternalIds
  seriesId?: string
  /** position inside the series (volume, season …) */
  seriesOrder?: number
  tagIds: string[]
  /** total / unit a new round starts with (each round keeps its own after that) */
  defaultProgress?: Progress
  categoryId?: string
  /** when the work was added; older ones don't have it */
  createdAt?: number
}

export interface Series extends Base {
  name: string
  /** position in the user's own order */
  order?: number
  cover?: string
}

/** One go at a work (a "round"); watching it again starts a new record and keeps the old ones. */
export interface Rec extends Base {
  workId: string
  round: number
  status: Status
  progress: Progress
  /** 0.5 – 5, or null when finished without a score */
  rating: number | null
  start: FuzzyDate
  end: FuzzyDate
  /** when this round was started in the app; older ones don't have it */
  createdAt?: number
}

/** Where a round stood at the end of one day. One per round per day (its id is made from both), so editing a day replaces it. */
export interface ProgressLog extends Base {
  workId: string
  recordId: string
  /** a full date, YYYY-MM-DD */
  date: string
  /** the progress reached that day (in the round's unit) */
  value: number
  /** where that day started from; left out when the days before were not recorded, so only "got to value" is known */
  from?: number
}

/** A note on a work. It always has a date; which round it belongs to is worked out from the dates. */
export interface WorkNote extends Base {
  workId: string
  /** 'note' = a quick note (筆記) written along the way; left out = a review (心得) */
  kind?: 'note'
  title?: string
  date: FuzzyDate
  /** where in the work the note was written (80 → "80 頁" / "80%", in the round's unit); left out when not given */
  progress?: number
  /** text */
  body: string
}

export interface Tag extends Base {
  name: string
  /** position in the user's own order */
  order?: number
  color?: string
}

export interface Category extends Base {
  name: string
  parentId?: string
  order: number
}

export interface MetaRow {
  key: string
  value: unknown
  updatedAt: number
}

export interface ImageRow {
  /** Drive file id */
  id: string
  blob: Blob
}

export interface TableMap {
  works: Work
  series: Series
  records: Rec
  notes: WorkNote
  progressLogs: ProgressLog
  tags: Tag
  categories: Category
}
export type TableName = keyof TableMap
