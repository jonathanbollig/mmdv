const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mmdv', {
  open: () => ipcRenderer.invoke('open'),
  save: text => ipcRenderer.invoke('save', text),
  setDirty: dirty => ipcRenderer.send('dirty', dirty),
  close: () => ipcRenderer.send('close'),
  openExternal: url => ipcRenderer.send('open-external', url),
  onSaveAndClose: fn => ipcRenderer.on('save-and-close', fn),
})
