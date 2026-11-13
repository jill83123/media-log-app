import { nextTick, watch, type Ref, type WatchSource } from 'vue'

/** Slide the rows of a list to their new places when its order changes (instead of snapping). */
export function animateReorder(box: Ref<HTMLElement | undefined>, order: WatchSource) {
  watch(
    order,
    async () => {
      const el = box.value
      if (!el) return
      const rows = Array.from(el.children) as HTMLElement[]
      const before = new Map(rows.map((r) => [r, r.getBoundingClientRect().top]))
      await nextTick()
      for (const r of Array.from(el.children) as HTMLElement[]) {
        const was = before.get(r)
        // the row in the finger's hand is already where the finger is
        if (was === undefined || r.classList.contains('z-10')) continue
        const dy = was - r.getBoundingClientRect().top
        if (Math.abs(dy) < 1) continue
        r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 150, easing: 'ease-out' })
      }
    },
    { flush: 'pre' },
  )
}

/** Index of the row the pointer is over, from layout positions (they ignore running animations). */
export function rowAt(box: HTMLElement, clientY: number, pick: (top: number, height: number) => boolean): number {
  const y = clientY - box.getBoundingClientRect().top
  const rows = Array.from(box.children) as HTMLElement[]
  return rows.findIndex((r) => {
    const top = r.offsetTop - (r.offsetParent === box ? 0 : box.offsetTop)
    return pick(y - top, r.offsetHeight)
  })
}

/** Keeps the row being dragged under the pointer (up and down), whatever slot the list has put it in. */
export function followPointer(handle: HTMLElement, start: PointerEvent) {
  const row = handle.closest('li') as HTMLElement | null
  const startY = start.clientY
  const startTop = row?.offsetTop ?? 0
  let lastY = startY
  const apply = () => {
    if (row) row.style.transform = `translateY(${lastY - startY - (row.offsetTop - startTop)}px)`
  }
  return {
    move(e: PointerEvent) {
      lastY = e.clientY
      apply()
      // the list may have just swapped places: measure again once it has
      void nextTick(apply)
    },
    end() {
      if (!row) return
      const from = row.style.transform
      row.style.transform = ''
      if (from) row.animate([{ transform: from }, { transform: 'none' }], { duration: 150, easing: 'ease-out' })
    },
  }
}
