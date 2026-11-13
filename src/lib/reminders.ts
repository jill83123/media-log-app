export interface PushSlot {
  /** epoch ms */
  t: number
  title: string
  body: string
  url?: string
}

export interface PlanInput {
  now: number
  /** HH:mm */
  time: string
  daily: boolean
  /** works in progress */
  doing: { id: string; title: string }[]
  /** something was already recorded today, so today's daily reminder is skipped */
  activeToday: boolean
}

const MAX_SLOTS = 30
const DAILY_DAYS = 14

/** epoch ms of HH:mm on the local day that starts `dayOffset` days after `now`'s day */
function at(now: number, dayOffset: number, time: string): number {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h ?? 21, m ?? 0, 0, 0)
  d.setDate(d.getDate() + dayOffset)
  return d.getTime()
}

/**
 * The notifications to hand to the Worker: a daily reminder for the next two weeks. Texts are fixed at planning time, so the plan is made again
 * whenever the data changes (see stores/push.ts).
 */
export function planSlots(p: PlanInput): PushSlot[] {
  const slots: PushSlot[] = []
  const names = p.doing.map((d) => `《${d.title}》`)
  if (p.daily) {
    for (let day = 0; day < DAILY_DAYS; day++) {
      const t = at(p.now, day, p.time)
      if (t <= p.now || (day === 0 && p.activeToday)) continue
      slots.push({
        t,
        title: '今日書影紀錄',
        body: names.length ? `在看／在讀 ${names.length} 部：${names.slice(0, 3).join('、')}${names.length > 3 ? '…' : ''}。今天更新進度了嗎？` : '今天有看了什麼嗎？記下來吧。',
      })
    }
  }
  return slots.sort((a, b) => a.t - b.t).slice(0, MAX_SLOTS)
}
