// Electron main process: one window per file, file I/O over IPC.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const fs = require('fs')
const path = require('path')

// Arguments after the app path that don't look like flags are files to open.
function filesFromArgv(argv) {
  const appPath = app.getAppPath()
  return argv.slice(1)
    .filter(a => !a.startsWith('-') && path.resolve(a) !== appPath)
    .map(a => path.resolve(process.cwd(), a))
}

function createWindow(filePath) {
  const win = new BrowserWindow({
    width: 1000,
    height: 900,
    backgroundColor: '#1e1e23',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  win.mmdv = { filePath, dirty: false, forceClose: false }
  updateTitle(win)

  win.on('close', e => {
    if (win.mmdv.forceClose || !win.mmdv.dirty) return
    e.preventDefault()
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      message: `Save changes to ${displayName(win)}?`,
      detail: 'Your changes will be lost if you don\'t save them.',
      buttons: ['Save', 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
    })
    if (choice === 0) win.webContents.send('save-and-close')
    else if (choice === 1) { win.mmdv.forceClose = true; win.close() }
  })

  // Links inside the page never navigate the window.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', e => e.preventDefault())

  win.loadFile(path.join(__dirname, 'index.html'))
  return win
}

function displayName(win) {
  return win.mmdv.filePath ? path.basename(win.mmdv.filePath) : 'Untitled'
}

function updateTitle(win) {
  win.setTitle(`${displayName(win)}${win.mmdv.dirty ? ' ●' : ''} — mmdv`)
}

const senderWin = e => BrowserWindow.fromWebContents(e.sender)

ipcMain.handle('open', e => {
  const { filePath } = senderWin(e).mmdv
  let text = ''
  if (filePath) {
    try { text = fs.readFileSync(filePath, 'utf8') }
    catch (err) { if (err.code !== 'ENOENT') throw err } // new file: created on first save
  }
  return { text, filePath, dir: filePath ? path.dirname(filePath) : process.cwd() }
})

ipcMain.handle('save', async (e, text) => {
  const win = senderWin(e)
  if (!win.mmdv.filePath) {
    const res = await dialog.showSaveDialog(win, {
      defaultPath: 'Untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (res.canceled) return null
    win.mmdv.filePath = res.filePath
  }
  fs.writeFileSync(win.mmdv.filePath, text, 'utf8')
  return { filePath: win.mmdv.filePath, dir: path.dirname(win.mmdv.filePath) }
})

ipcMain.on('dirty', (e, dirty) => {
  const win = senderWin(e)
  win.mmdv.dirty = dirty
  updateTitle(win)
})

ipcMain.on('close', e => {
  const win = senderWin(e)
  win.mmdv.forceClose = true
  win.close()
})

ipcMain.on('open-external', (e, url) => {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  const files = filesFromArgv(process.argv)
  if (files.length === 0) createWindow(null)
  else files.forEach(createWindow)
})

app.on('window-all-closed', () => app.quit())
