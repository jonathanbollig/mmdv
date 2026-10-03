// Obsidian-style live preview: markdown syntax is hidden and rendered,
// except on the lines the selection touches.
import { Decoration, ViewPlugin, WidgetType, EditorView } from '@codemirror/view'
import { StateField, StateEffect } from '@codemirror/state'
import { syntaxTree, foldEffect } from '@codemirror/language'

// Folder of the open file, used to resolve relative image paths.
export const baseDir = StateEffect.define()
const dirField = StateField.define({
  create: () => '',
  update(dir, tr) {
    for (const e of tr.effects) if (e.is(baseDir)) dir = e.value
    return dir
  },
})

const hidden = Decoration.replace({})
const lineDeco = cls => Decoration.line({ class: cls })
const markDeco = cls => Decoration.mark({ class: cls })

class BulletWidget extends WidgetType {
  eq() { return true }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-bullet'
    el.textContent = '•'
    return el
  }
}

class CheckboxWidget extends WidgetType {
  constructor(checked) { super(); this.checked = checked }
  eq(other) { return other.checked === this.checked }
  toDOM(view) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-task-checkbox'
    box.checked = this.checked
    box.addEventListener('mousedown', e => {
      e.preventDefault()
      const from = view.posAtDOM(box)
      const pos = from + view.state.sliceDoc(from, from + 20).indexOf('[') + 1
      view.dispatch({ changes: { from: pos, to: pos + 1, insert: this.checked ? ' ' : 'x' } })
    })
    return box
  }
  ignoreEvent() { return true }
}

class ImageWidget extends WidgetType {
  constructor(src, alt) { super(); this.src = src; this.alt = alt }
  eq(other) { return other.src === this.src && other.alt === this.alt }
  toDOM(view) {
    const img = document.createElement('img')
    img.className = 'cm-image'
    img.src = this.src
    img.alt = img.title = this.alt
    img.onload = img.onerror = () => view.requestMeasure()
    return img
  }
}

class LabelWidget extends WidgetType {
  constructor(text) { super(); this.text = text }
  eq(other) { return other.text === this.text }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-code-lang'
    el.textContent = this.text
    return el
  }
}

const copyIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5h-5a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5h2"/></svg>'
const checkIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8.5l3.2 3L13 4.5"/></svg>'

class CopyWidget extends WidgetType {
  constructor(code) { super(); this.code = code }
  eq(other) { return other.code === this.code }
  toDOM() {
    const btn = document.createElement('button')
    btn.className = 'cm-code-copy'
    btn.title = 'Copy code'
    btn.innerHTML = copyIcon
    btn.addEventListener('mousedown', e => {
      e.preventDefault()
      navigator.clipboard.writeText(this.code).then(() => {
        btn.innerHTML = checkIcon
        setTimeout(() => { btn.innerHTML = copyIcon }, 1200)
      })
    })
    return btn
  }
  ignoreEvent() { return true }
}

function resolveImage(src, dir) {
  src = src.replace(/^<|>$/g, '')
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return src
  try { src = decodeURI(src) } catch {}
  const abs = src.startsWith('/') ? src : `${dir}/${src}`
  return 'file://' + abs.split('/').map(encodeURIComponent).join('/')
}

// End of a YAML frontmatter block at the top of the document, or 0.
function frontmatterEnd(doc) {
  if (doc.lines < 2 || doc.line(1).text !== '---') return 0
  for (let n = 2; n <= doc.lines; n++) {
    const line = doc.line(n)
    if (line.text === '---' || line.text === '...') return line.to
  }
  return 0
}

function buildDecorations(view) {
  const { state } = view
  const { doc } = state
  const dir = state.field(dirField)
  const decos = []
  const add = (deco, from, to = from) => decos.push(deco.range(from, to))
  const hide = (from, to) => { if (to > from) add(hidden, from, to) }
  const text = node => state.sliceDoc(node.from, node.to)

  const activeLines = new Set()
  for (const r of state.selection.ranges) {
    const last = doc.lineAt(r.to).number
    for (let n = doc.lineAt(r.from).number; n <= last; n++) activeLines.add(n)
  }
  const isActive = (from, to = from) => {
    const last = doc.lineAt(to).number
    for (let n = doc.lineAt(from).number; n <= last; n++) if (activeLines.has(n)) return true
    return false
  }
  const eachLine = (from, to, fn) => {
    for (let n = doc.lineAt(from).number, last = doc.lineAt(to).number; n <= last; n++) fn(doc.line(n), n === last)
  }

  // Text of lines a..b with the block's indentation (a string prefix or a regex) removed.
  const codeText = (a, b, indent) => {
    const lines = []
    for (let n = a; n <= b; n++) {
      const t = doc.line(n).text
      lines.push(typeof indent === 'string' ? (t.startsWith(indent) ? t.slice(indent.length) : t.trimStart()) : t.replace(indent, ''))
    }
    return lines.join('\n')
  }

  const fmEnd = frontmatterEnd(doc)
  if (fmEnd) eachLine(0, fmEnd, line => add(lineDeco('cm-frontmatter'), line.from))

  const { from, to } = view.viewport
  syntaxTree(state).iterate({
    from, to,
    enter(ref) {
      const { name } = ref
      if (name !== 'Document' && ref.from < fmEnd) return false
      const node = ref.node
      const parent = node.parent?.name
      const active = isActive(ref.from, ref.to)

      let m
      if ((m = /^ATXHeading(\d)$/.exec(name))) {
        add(lineDeco(`cm-h cm-h${m[1]}`), doc.lineAt(ref.from).from)
      } else if ((m = /^SetextHeading(\d)$/.exec(name))) {
        eachLine(ref.from, ref.to, (line, last) => {
          if (!last) add(lineDeco(`cm-h cm-h${m[1]}`), line.from)
        })
      } else if (name === 'HeaderMark') {
        if (active) return
        if (parent?.startsWith('Setext')) return hide(ref.from, ref.to)
        const opening = node.parent.firstChild.from === ref.from
        if (opening) hide(ref.from, ref.to + (state.sliceDoc(ref.to, ref.to + 1) === ' ' ? 1 : 0))
        else hide(ref.from - (state.sliceDoc(ref.from - 1, ref.from) === ' ' ? 1 : 0), ref.to)
      } else if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
        if (!active) hide(ref.from, ref.to)
      } else if (name === 'Escape') {
        if (!active) hide(ref.from, ref.from + 1)
      } else if (name === 'InlineCode') {
        add(markDeco('cm-inline-code'), ref.from, ref.to)
      } else if (name === 'CodeMark' && parent === 'InlineCode') {
        if (!active) hide(ref.from, ref.to)
      } else if (name === 'Link') {
        // Only inline links [text](url) and full references [text][ref];
        // a bare [text] is left alone so [[wiki links]] keep their brackets.
        if (state.sliceDoc(ref.from - 1, ref.from + 2).includes('[[')) return
        const marks = node.getChildren('LinkMark')
        const url = node.getChild('URL')
        if (!url && marks.length < 4) return
        const labelFrom = marks[0].to, labelTo = marks[1].from
        if (labelTo > labelFrom) {
          const attributes = url ? { 'data-href': text(url) } : {}
          add(Decoration.mark({ class: 'cm-link', attributes }), labelFrom, labelTo)
        }
        if (!active) { hide(ref.from, labelFrom); hide(labelTo, ref.to) }
      } else if (name === 'URL' && !['Link', 'Image', 'LinkReference'].includes(parent)) {
        add(Decoration.mark({ class: 'cm-link', attributes: { 'data-href': text(ref) } }), ref.from, ref.to)
      } else if (name === 'Image') {
        const marks = node.getChildren('LinkMark')
        const url = node.getChild('URL')
        if (!url || marks.length < 2) return false
        const widget = new ImageWidget(resolveImage(text(url), dir), state.sliceDoc(marks[0].to, marks[1].from))
        if (active) add(Decoration.widget({ widget, side: 1 }), ref.to)
        else add(Decoration.replace({ widget }), ref.from, ref.to)
        return false
      } else if (name === 'ListMark') {
        const item = node.parent
        if (active || item.getChild('Task')) return
        if (item.parent?.name === 'BulletList') add(Decoration.replace({ widget: new BulletWidget() }), ref.from, ref.to)
        else add(markDeco('cm-list-number'), ref.from, ref.to)
      } else if (name === 'Task') {
        const marker = node.getChild('TaskMarker')
        if (!marker) return
        const checked = /x/i.test(text(marker))
        if (checked && ref.to > marker.to) add(markDeco('cm-task-done'), marker.to, ref.to)
        const listMark = node.parent?.getChild('ListMark')
        if (!active && listMark) add(Decoration.replace({ widget: new CheckboxWidget(checked) }), listMark.from, marker.to)
      } else if (name === 'Blockquote') {
        eachLine(ref.from, ref.to, line => add(lineDeco('cm-quote'), line.from))
      } else if (name === 'QuoteMark') {
        if (!active) hide(ref.from, ref.to + (state.sliceDoc(ref.to, ref.to + 1) === ' ' ? 1 : 0))
      } else if (name === 'HorizontalRule') {
        if (!active) { add(lineDeco('cm-hr'), doc.lineAt(ref.from).from); hide(ref.from, ref.to) }
      } else if (name === 'FencedCode') {
        const first = doc.lineAt(ref.from), last = doc.lineAt(ref.to)
        const closed = last.number > first.number && /^\s*(```|~~~)/.test(last.text)
        const indent = /^\s*/.exec(first.text)[0]
        add(Decoration.widget({ widget: new CopyWidget(codeText(first.number + 1, closed ? last.number - 1 : last.number, indent)), side: 1 }), first.to)
        eachLine(ref.from, ref.to, line => {
          let cls = 'cm-codeblock'
          if (line.number === first.number) cls += ' cm-codeblock-begin'
          if (line.number === last.number) cls += ' cm-codeblock-end'
          if (!active && (line.number === first.number || (line.number === last.number && closed)))
            cls += ' cm-fence'
          add(lineDeco(cls), line.from)
        })
        if (!active) {
          const info = node.getChild('CodeInfo')
          add(Decoration.replace({ widget: new LabelWidget(info ? text(info) : '') }), first.from, first.to)
          if (closed) hide(last.from, last.to)
        }
        return false
      } else if (name === 'CodeBlock') {
        const first = doc.lineAt(ref.from), last = doc.lineAt(ref.to)
        add(Decoration.widget({ widget: new CopyWidget(codeText(first.number, last.number, /^( {1,4}|\t)/)), side: 1 }), first.to)
        eachLine(ref.from, ref.to, (line, last) => {
          add(lineDeco('cm-codeblock' + (line.from === doc.lineAt(ref.from).from ? ' cm-codeblock-begin' : '') + (last ? ' cm-codeblock-end' : '')), line.from)
        })
        return false
      } else if (name === 'Table') {
        eachLine(ref.from, ref.to, line => add(lineDeco('cm-table'), line.from))
      }
    },
  })

  // [[wiki links]] and [[target|alias]]: styled, brackets hidden. Not clickable yet.
  const tree = syntaxTree(state)
  for (const m of state.sliceDoc(from, to).matchAll(/\[\[([^\[\]|\n]+)(\|[^\[\]\n]+)?\]\]/g)) {
    const start = from + m.index, end = start + m[0].length
    if (start < fmEnd || /Code/.test(tree.resolveInner(start, 1).name)) continue
    const labelFrom = m[2] ? start + 2 + m[1].length + 1 : start + 2
    add(markDeco('cm-link'), labelFrom, end - 2)
    if (!isActive(start, end)) { hide(start, labelFrom); hide(end - 2, end) }
  }
  return Decoration.set(decos, true)
}

// Frontmatter folded away on open; click the placeholder to unfold.
export function foldFrontmatter(view) {
  const end = frontmatterEnd(view.state.doc)
  if (end) view.dispatch({ effects: foldEffect.of({ from: view.state.doc.line(1).to, to: end }) })
}

const previewPlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = buildDecorations(view) }
  update(u) {
    if (u.docChanged || u.viewportChanged || u.selectionSet ||
        syntaxTree(u.startState) !== syntaxTree(u.state) ||
        u.startState.field(dirField) !== u.state.field(dirField))
      this.decorations = buildDecorations(u.view)
  }
}, { decorations: v => v.decorations })

// Ctrl+click on a link opens it in the default browser.
const linkClicks = EditorView.domEventHandlers({
  mousedown(e) {
    if (!(e.ctrlKey || e.metaKey)) return false
    const link = e.target.closest?.('[data-href]')
    if (!link) return false
    e.preventDefault()
    window.mmdv.openExternal(link.dataset.href)
    return true
  },
})

export function livePreview(dir) {
  return [dirField.init(() => dir), previewPlugin, linkClicks]
}
