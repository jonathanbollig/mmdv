// Full-window image viewer: wheel or pinch zooms around the pointer, drag pans,
// double-click toggles fit / 100%, Esc or a click without dragging closes.
export function openLightbox(src, alt) {
  const overlay = document.createElement('div')
  overlay.className = 'mmdv-lightbox'
  const img = overlay.appendChild(document.createElement('img'))
  img.src = src
  img.alt = alt
  img.draggable = false
  document.body.appendChild(overlay)

  let x = 0, y = 0, s = 1, fit = 1
  const apply = () => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${s})`
    // Past 2x, show real pixels instead of a blur (screenshots, small text).
    img.style.imageRendering = s > 2 ? 'pixelated' : 'auto'
  }
  const center = scale => {
    s = scale
    x = (innerWidth - img.naturalWidth * s) / 2
    y = (innerHeight - img.naturalHeight * s) / 2
    apply()
  }
  const zoomAt = (px, py, k) => {
    k = Math.min(Math.max(k, 0.1 * fit / s), 40 / s)
    x = px - (px - x) * k
    y = py - (py - y) * k
    s *= k
    apply()
  }
  img.onload = () => {
    fit = Math.min(1, (innerWidth - 40) / img.naturalWidth, (innerHeight - 40) / img.naturalHeight)
    center(fit)
  }

  const close = () => {
    overlay.remove()
    removeEventListener('keydown', onKey, true)
  }
  // Keys never reach the editor behind, except other shortcuts like Ctrl+S.
  const onKey = e => {
    const cx = innerWidth / 2, cy = innerHeight / 2
    if (e.key === 'Escape' || e.key === ' ') close()
    else if (e.key === '+' || e.key === '=') zoomAt(cx, cy, 1.25)
    else if (e.key === '-') zoomAt(cx, cy, 0.8)
    else if (e.key === '0') center(fit)
    else if (e.key === '1') center(1)
    else if (e.ctrlKey || e.metaKey) return
    e.preventDefault()
    e.stopPropagation()
  }
  addEventListener('keydown', onKey, true)

  overlay.addEventListener('wheel', e => {
    e.preventDefault()
    // Mouse notches are ~100 per event, pinch deltas small: cap each step.
    const d = Math.max(-25, Math.min(25, e.deltaY))
    zoomAt(e.clientX, e.clientY, Math.exp(-d * (e.ctrlKey ? 0.02 : 0.008)))
  }, { passive: false })

  overlay.addEventListener('dblclick', e => {
    if (Math.abs(s - fit) > 1e-3) center(fit)
    else zoomAt(e.clientX, e.clientY, Math.max(2, 1 / fit))
  })

  overlay.addEventListener('pointerdown', e => {
    if (e.button !== 0) return
    overlay.setPointerCapture(e.pointerId)
    const start = { cx: e.clientX, cy: e.clientY, x, y, target: e.target }
    let moved = false
    const move = e => {
      const dx = e.clientX - start.cx, dy = e.clientY - start.cy
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      x = start.x + dx
      y = start.y + dy
      apply()
    }
    overlay.addEventListener('pointermove', move)
    overlay.addEventListener('pointerup', () => {
      overlay.removeEventListener('pointermove', move)
      // A plain click on the backdrop closes; on the image it does nothing,
      // so a double-click on the image doesn't close the viewer.
      if (!moved && start.target === overlay) close()
    }, { once: true })
  })
}
