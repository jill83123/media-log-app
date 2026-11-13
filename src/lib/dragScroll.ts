import type { Directive } from 'vue'

/**
 * v-drag-scroll: lets a sideways-scrolling row (the chip bars) be dragged with a mouse.
 * Touch already scrolls by itself, so only the mouse is handled here. A drag does not count as a click.
 */
type Cleanup = () => void
const cleanups = new WeakMap<HTMLElement, Cleanup>()

export const vDragScroll: Directive<HTMLElement> = {
  mounted(el) {
    // the grab / grabbing hand comes from the [data-drag-scroll] rules in main.css
    el.dataset.dragScroll = ''
    let startX = 0
    let startLeft = 0
    let down = false
    let moved = false

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      down = true
      moved = false
      startX = e.clientX
      startLeft = el.scrollLeft
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - startX
      if (!moved && Math.abs(dx) > 4) {
        moved = true
        el.dataset.dragScroll = 'dragging'
        el.setPointerCapture(e.pointerId)
      }
      if (moved) el.scrollLeft = startLeft - dx
    }
    const onUp = () => {
      down = false
      el.dataset.dragScroll = ''
    }
    /** the click that follows a drag belongs to the drag, not to the chip under the pointer */
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.stopPropagation()
        e.preventDefault()
        moved = false
      }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('click', onClick, true)
    cleanups.set(el, () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('click', onClick, true)
    })
  },
  unmounted(el) {
    cleanups.get(el)?.()
    cleanups.delete(el)
  },
}
