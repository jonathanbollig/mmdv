const { contextBridge, ipcRenderer, webFrame } = require('electron')

// Zoom: Ctrl +/-/0, Ctrl+wheel and touchpad pinch (which arrives as Ctrl+wheel).
const setZoom = f => webFrame.setZoomFactor(Math.min(3, Math.max(0.5, f)))

window.addEventListener('keydown', e => {
  if (!e.ctrlKey || e.altKey || e.metaKey) return
  const f = webFrame.getZoomFactor()
  if (e.key === '+' || e.key === '=') setZoom(f * 1.1)
  else if (e.key === '-') setZoom(f / 1.1)
  else if (e.key === '0') setZoom(1)
  else return
  e.preventDefault()
  e.stopPropagation()
}, true)

window.addEventListener('wheel', e => {
  if (!e.ctrlKey) return
  e.preventDefault()
  // Mouse wheel notches are ~100 per event, pinch deltas are small: cap each step at ~10%.
  const d = Math.max(-10, Math.min(10, e.deltaY))
  setZoom(webFrame.getZoomFactor() * Math.exp(-d * 0.01))
}, { passive: false, capture: true })

contextBridge.exposeInMainWorld('mmdv', {
  open: () => ipcRenderer.invoke('open'),
  save: text => ipcRenderer.invoke('save', text),
  setDirty: dirty => ipcRenderer.send('dirty', dirty),
  close: () => ipcRenderer.send('close'),
  openExternal: url => ipcRenderer.send('open-external', url),
  onSaveAndClose: fn => ipcRenderer.on('save-and-close', fn),
  onSaveRequest: fn => ipcRenderer.on('save-request', fn),
  onToggleQuote: fn => ipcRenderer.on('toggle-quote', fn),
  onFileChanged: fn => ipcRenderer.on('file-changed', (e, text) => fn(text)),
})
