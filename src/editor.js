import { EditorState } from '@codemirror/state'
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { indentUnit, codeFolding } from '@codemirror/language'
import { theme, highlighting } from './theme.js'
import { livePreview, baseDir, foldFrontmatter } from './livepreview.js'

async function main() {
  const file = await window.mmdv.open()
  const crlf = file.text.includes('\r\n')
  let savedDoc = null

  const save = async view => {
    let text = view.state.doc.toString()
    if (crlf) text = text.replace(/\n/g, '\r\n')
    const res = await window.mmdv.save(text)
    if (!res) return false
    savedDoc = view.state.doc
    view.dispatch({ effects: baseDir.of(res.dir) })
    window.mmdv.setDirty(false)
    return true
  }

  let wasDirty = false
  const trackDirty = EditorView.updateListener.of(update => {
    if (!update.docChanged) return
    const dirty = !update.state.doc.eq(savedDoc)
    if (dirty !== wasDirty) window.mmdv.setDirty(wasDirty = dirty)
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
        codeFolding({ placeholderText: 'frontmatter' }),
        keymap.of([
          { key: 'Mod-s', run: view => { save(view); return true } },
          ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab,
        ]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        theme,
        highlighting,
        livePreview(file.dir),
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
  })

  window.mmdv.onSaveRequest(() => save(view))

  window.mmdv.onSaveAndClose(async () => {
    if (await save(view)) window.mmdv.close()
  })
}

main()
