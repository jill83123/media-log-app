/** Keeps the page behind a sheet or popup from scrolling. Counted, so a popup over a sheet doesn't unlock it early. */
let count = 0
let prev = ''

export function lockScroll(on: boolean) {
  if (on) {
    if (count++ === 0) {
      prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
  } else if (count > 0 && --count === 0) document.body.style.overflow = prev
}
