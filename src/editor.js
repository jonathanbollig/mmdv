import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { indentUnit, codeFolding, foldKeymap } from '@codemirror/language'
import { theme, highlighting } from './theme.js'
import { livePreview, baseDir, foldFrontmatter, foldPlaceholder } from './livepreview.js'
import { Highlight, MathSyntax } from './syntax.js'

// Typing one of these with text selected wraps the selection instead of
// replacing it. The selection stays on the inner text, so pressing `*` twice
// makes bold, `~` twice strikethrough and `=` twice highlight.
const wrapPairs = {
  '`': '`', '(': ')', '[': ']', '{': '}', '"': '"', "'": "'",
  '*': '*', '_': '_', '~': '~', '=': '=', '$': '$', '<': '>',
}

const wrapSelection = EditorView.inputHandler.of((view, from, to, text) => {
  const close = wrapPairs[text]
  const { state } = view
  if (!close || state.selection.ranges.some(r => r.empty)) return false
  view.dispatch(state.changeByRange(range => ({
    changes: [{ from: range.from, insert: text }, { from: range.to, insert: close }],
    range: EditorSelection.range(range.anchor + text.length, range.head + text.length),
  })), { scrollIntoView: true, userEvent: 'input.type' })
  return true
})

// Ctrl+Shift+Q (or the context menu): turn the selected lines into a blockquote,
// or unquote them if they all are quoted already. Blank lines get a bare `>`
// so the quote stays one block.
function toggleQuote(view) {
  const { state } = view
  const lines = new Map()
  for (const r of state.selection.ranges) {
    for (let pos = r.from; ;) {
      const line = state.doc.lineAt(pos)
      lines.set(line.number, line)
      if (line.to >= r.to) break
      pos = line.to + 1
    }
  }
  const all = [...lines.values()]
  const quoted = all.every(l => /^\s*>/.test(l.text) || !l.text.trim())
    && all.some(l => /^\s*>/.test(l.text))
  const changes = all.map(l => {
    if (quoted) {
      const m = /^(\s*)> ?/.exec(l.text)
      return m ? { from: l.from + m[1].length, to: l.from + m[0].length } : null
    }
    return { from: l.from, insert: l.text.trim() ? '> ' : '>' }
  }).filter(Boolean)
  view.dispatch({ changes, scrollIntoView: true, userEvent: 'input' })
  return true
}

// Pasting an image (screenshot, copied picture) saves it next to the file and
// inserts a link. Clipboards that also carry text (e.g. spreadsheet cells) paste the text.
function imagePaste(ensureSaved) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const data = event.clipboardData
      const image = [...data.files].find(f => f.type.startsWith('image/'))
      if (!image || data.types.includes('text/plain')) return false
      event.preventDefault()
      ;(async () => {
        if (!await ensureSaved(view)) return
        const ext = image.type.split('/')[1].replace('jpeg', 'jpg').replace(/\+.*/, '')
        const name = await window.mmdv.saveImage(await image.arrayBuffer(), ext)
        if (!name) return
        const insert = `![](${encodeURI(name)})`
        view.dispatch(view.state.replaceSelection(insert), { scrollIntoView: true, userEvent: 'input.paste' })
      })()
      return true
    },
  })
}

async function main() {
  const file = await window.mmdv.open()
  // Obsidian CSS snippets go last so they override the defaults in style.css.
  document.body.classList.add('theme-dark')
  const snippets = document.createElement('style')
  snippets.textContent = file.css
  document.head.append(snippets)

  let hasPath = !!file.filePath
  const crlf = file.text.includes('\r\n')
  let savedDoc = null

  let wasDirty = false
  const setDirty = dirty => { if (dirty !== wasDirty) window.mmdv.setDirty(wasDirty = dirty) }

  let autoSaveTimer = null
  const save = async (view, auto = false) => {
    clearTimeout(autoSaveTimer)
    // Remember what was written: typing may continue while the save is in flight.
    const doc = view.state.doc
    let text = doc.toString()
    if (crlf) text = text.replace(/\n/g, '\r\n')
    const res = await window.mmdv.save(text, auto)
    if (!res) return false
    savedDoc = doc
    hasPath = true
    view.dispatch({ effects: baseDir.of(res.dir) })
    setDirty(!view.state.doc.eq(savedDoc))
    return true
  }

  // Auto save a second after the last edit. Untitled files wait for Ctrl+S,
  // so the save dialog never pops up by itself.
  const trackDirty = EditorView.updateListener.of(update => {
    if (!update.docChanged) return
    const dirty = !update.state.doc.eq(savedDoc)
    setDirty(dirty)
    clearTimeout(autoSaveTimer)
    if (dirty && hasPath) autoSaveTimer = setTimeout(() => save(update.view, true), 1000)
  })

  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: file.text.replace(/\r\n/g, '\n'),
      extensions: [
        history(),
        drawSelection(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        indentUnit.of('\t'),
        codeFolding(foldPlaceholder),
        keymap.of([
          { key: 'Mod-s', run: view => { save(view); return true } },
          { key: 'Mod-Shift-q', run: toggleQuote },
          ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab,
        ]),
        markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [Highlight, MathSyntax] }),
        theme,
        highlighting,
        livePreview(file.dir),
        wrapSelection,
        // An untitled file has no folder yet: save it first so the image has a home.
        imagePaste(view => hasPath || save(view)),
        trackDirty,
      ],
    }),
  })
  savedDoc = view.state.doc
  foldFrontmatter(view)
  window.editorView = view // for debugging from devtools
  view.focus()

  // External change on disk (main asks first if there are unsaved edits).
  // Only the differing middle is replaced, so cursor and scroll stay put.
  window.mmdv.onFileChanged(raw => {
    const text = raw.replace(/\r\n/g, '\n')
    const old = view.state.doc.toString()
    if (text === old) return
    let from = 0
    while (from < old.length && from < text.length && old[from] === text[from]) from++
    let end = 0
    while (end < old.length - from && end < text.length - from &&
           old[old.length - 1 - end] === text[text.length - 1 - end]) end++
    const tr = view.state.update({
      changes: { from, to: old.length - end, insert: text.slice(from, text.length - end) },
    })
    savedDoc = tr.newDoc
    view.dispatch(tr)
    setDirty(false)
  })

  window.mmdv.onSaveRequest(() => save(view))
  window.mmdv.onToggleQuote(() => { toggleQuote(view); view.focus() })

  window.mmdv.onSaveAndClose(async () => {
    if (await save(view)) window.mmdv.close()
  })
}

main()
