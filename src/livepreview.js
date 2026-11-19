// Obsidian-style live preview: markdown syntax is hidden and rendered,
// except on the lines the selection touches.
import { Decoration, ViewPlugin, WidgetType, EditorView, keymap } from '@codemirror/view'
import { StateField, StateEffect, Prec } from '@codemirror/state'
import { syntaxTree, foldEffect, unfoldEffect, foldable, foldedRanges } from '@codemirror/language'
import katex from 'katex'
import { openLightbox } from './lightbox.js'
import 'katex/dist/katex.min.css'

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

// Obsidian's size syntax in the alt text: `![caption|300](x.png)` or `|300x200`
// (`\|300` inside tables, where a bare `|` would end the cell).
function parseAlt(alt) {
  const m = /^(.*?)\\?\|(\d+)(?:x(\d+))?$/.exec(alt)
  return m ? { alt: m[1], width: +m[2], height: m[3] ? +m[3] : null } : { alt, width: null, height: null }
}

function sizeImage(img, { width, height }) {
  img.style.width = width ? `${width}px` : ''
  img.style.height = width && height ? `${height}px` : ''
}

// The Image node at a widget's position (replace widgets sit at its start,
// cursor-line widgets right after its end).
function imageAt(state, pos) {
  for (const side of [1, -1]) {
    for (let n = syntaxTree(state).resolveInner(pos, side); n; n = n.parent)
      if (n.name === 'Image') return n
  }
  return null
}

class ImageWidget extends WidgetType {
  constructor(src, alt) { super(); this.src = src; this.alt = alt }
  eq(other) { return other.src === this.src && other.alt === this.alt }
  toDOM(view) {
    const size = parseAlt(this.alt)
    const wrap = document.createElement('span')
    wrap.className = 'cm-image-wrap'
    const img = wrap.appendChild(document.createElement('img'))
    img.className = 'cm-image'
    img.src = this.src
    img.alt = img.title = size.alt
    sizeImage(img, size)
    img.onload = img.onerror = () => view.requestMeasure()
    img.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      e.preventDefault()
      openLightbox(img.src, img.alt)
    })

    // Corner handle: drag to resize, keeping the aspect ratio; on release the
    // width is written into the alt text as `|width`.
    const handle = wrap.appendChild(document.createElement('span'))
    handle.className = 'cm-image-handle'
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0) return
      e.preventDefault()
      handle.setPointerCapture(e.pointerId)
      const startX = e.clientX, startW = img.getBoundingClientRect().width
      const max = view.contentDOM.clientWidth
      let width = Math.round(startW)
      const move = e => {
        width = Math.round(Math.min(max, Math.max(32, startW + e.clientX - startX)))
        sizeImage(img, { width })
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', () => {
        handle.removeEventListener('pointermove', move)
        const node = imageAt(view.state, view.posAtDOM(wrap))
        const marks = node?.getChildren('LinkMark')
        if (!marks || marks.length < 2) return
        const insert = `${size.alt}|${width}`
        view.dispatch({ changes: { from: marks[0].to, to: marks[1].from, insert } })
      }, { once: true })
    })
    return wrap
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

// LaTeX rendered with KaTeX. Clicking it puts the cursor into the source.
// Errors are shown in place (red) instead of throwing.
class MathWidget extends WidgetType {
  constructor(tex, display, quoted = false) { super(); this.tex = tex; this.display = display; this.quoted = quoted }
  eq(other) { return other.tex === this.tex && other.display === this.display && other.quoted === this.quoted }
  toDOM(view) {
    const el = document.createElement(this.display ? 'div' : 'span')
    el.className = this.display ? 'cm-math-block' + (this.quoted ? ' cm-quote' : '') : 'cm-math'
    renderMath(el, this.tex, this.display)
    el.addEventListener('mousedown', e => {
      e.preventDefault()
      view.dispatch({ selection: { anchor: view.posAtDOM(el) } })
      view.focus()
    })
    return el
  }
  ignoreEvent() { return true }
}

function renderMath(el, tex, display) {
  katex.render(tex, el, { displayMode: display, throwOnError: false })
}

// TeX source of an InlineMath or BlockMath node (between its MathMarks).
function mathSource(state, node) {
  const marks = node.getChildren('MathMark')
  const from = marks[0].to, to = marks.length > 1 ? marks[marks.length - 1].from : node.to
  return state.sliceDoc(from, to).replace(/^[ \t]*>[ \t]?/gm, '').trim()
}

// Chevron left of a heading: folds or unfolds its section.
class FoldWidget extends WidgetType {
  constructor(folded) { super(); this.folded = folded }
  eq(other) { return other.folded === this.folded }
  toDOM(view) {
    const el = document.createElement('span')
    el.className = 'cm-fold-toggle' + (this.folded ? ' cm-folded' : '')
    el.innerHTML = chevronIcon
    el.title = this.folded ? 'Unfold section' : 'Fold section'
    el.addEventListener('mousedown', e => {
      e.preventDefault()
      const line = view.state.doc.lineAt(view.posAtDOM(el))
      const folded = foldedAt(view.state, line.to)
      if (folded) return view.dispatch({ effects: unfoldEffect.of(folded) })
      const range = foldable(view.state, line.from, line.to)
      if (range) view.dispatch({ effects: foldEffect.of(range) })
    })
    return el
  }
  ignoreEvent() { return true }
}

function foldedAt(state, pos) {
  let found = null
  foldedRanges(state).between(pos, pos, (from, to) => { if (from === pos) found = { from, to } })
  return found
}

const chevronIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6l4 4 4-4"/></svg>'
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

// A table rendered as HTML. Built from a plain description (see tableSpec), so the
// DOM can be reused while the source is unchanged. Clicking a cell puts the cursor
// there, which shows the raw markdown again; Ctrl+click on a link opens it.
class TableWidget extends WidgetType {
  constructor(spec, source) { super(); this.spec = spec; this.source = source }
  eq(other) { return other.source === this.source }
  toDOM(view) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-table-widget'
    const table = wrap.appendChild(document.createElement('table'))
    const head = table.appendChild(document.createElement('thead'))
    const body = table.appendChild(document.createElement('tbody'))
    this.spec.rows.forEach((row, i) => {
      const tr = (i ? body : head).appendChild(document.createElement('tr'))
      row.forEach((cell, col) => {
        const td = tr.appendChild(document.createElement(i ? 'td' : 'th'))
        if (this.spec.align[col]) td.style.textAlign = this.spec.align[col]
        td.dataset.offset = cell.offset
        const box = td.appendChild(document.createElement('div'))
        box.className = 'cm-table-cell'
        appendInline(box, cell.content)
      })
    })
    wrap.addEventListener('mousedown', e => {
      const link = e.target.closest('[data-href]')
      if ((e.ctrlKey || e.metaKey) && link) {
        e.preventDefault()
        return window.mmdv.openExternal(link.dataset.href)
      }
      const img = e.target.closest('.cm-table-image')
      if (img && !link && e.button === 0) {
        e.preventDefault()
        return openLightbox(img.src, img.alt)
      }
      const cell = e.target.closest('[data-offset]')
      e.preventDefault()
      const pos = view.posAtDOM(wrap) + (cell ? +cell.dataset.offset : 0)
      view.dispatch({ selection: { anchor: pos } })
      view.focus()
    })
    return wrap
  }
  ignoreEvent() { return true }
}

function appendInline(parent, items) {
  for (const item of items) {
    if (typeof item === 'string') { parent.append(item); continue }
    const el = parent.appendChild(document.createElement(item.tag))
    if (item.cls) el.className = item.cls
    if (item.href) el.dataset.href = item.href
    if (item.src) {
      const size = parseAlt(item.alt)
      el.src = item.src
      el.alt = el.title = size.alt
      sizeImage(el, size)
    }
    if (item.children) appendInline(el, item.children)
    if (item.tex) renderMath(el, item.tex, false)
  }
}

const inlineTags = { StrongEmphasis: 'strong', Emphasis: 'em', Strikethrough: 's', Highlight: 'mark' }
const inlineMarks = new Set(['EmphasisMark', 'StrikethroughMark', 'HighlightMark', 'CodeMark', 'LinkMark', 'URL', 'LinkTitle', 'LinkLabel'])

// Inline content of node between from and to, as strings and {tag, ...} items.
function inlineSpec(state, node, from, to, dir) {
  const out = []
  let pos = from
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.from > pos) out.push(state.sliceDoc(pos, c.from))
    pos = c.to
    const text = state.sliceDoc(c.from, c.to)
    if (inlineMarks.has(c.name)) continue
    if (c.name === 'Escape') out.push(text.slice(1))
    else if (inlineTags[c.name]) out.push({ tag: inlineTags[c.name], children: inlineSpec(state, c, c.from, c.to, dir) })
    else if (c.name === 'InlineMath') out.push({ tag: 'span', cls: 'cm-math', tex: mathSource(state, c) })
    else if (c.name === 'InlineCode') out.push({ tag: 'code', cls: 'cm-inline-code', children: inlineSpec(state, c, c.from, c.to, dir) })
    else if (c.name === 'Link') {
      const url = c.getChild('URL')
      out.push({ tag: 'span', cls: 'cm-link', href: url && state.sliceDoc(url.from, url.to), children: inlineSpec(state, c, c.from, c.to, dir) })
    } else if (c.name === 'Image') {
      const url = c.getChild('URL'), marks = c.getChildren('LinkMark')
      if (url && marks.length >= 2) out.push({ tag: 'img', cls: 'cm-table-image', src: resolveImage(state.sliceDoc(url.from, url.to), dir), alt: state.sliceDoc(marks[0].to, marks[1].from) })
      else out.push(text)
    } else out.push(...inlineSpec(state, c, c.from, c.to, dir))
  }
  if (to > pos) out.push(state.sliceDoc(pos, to))
  return out
}

// Rows of cells (header first) and column alignments of a Table node.
// Cells are split at the row's pipe delimiters, so empty cells are kept.
function tableSpec(state, table, dir) {
  const base = state.doc.lineAt(table.from).from
  const rows = []
  let align = []
  for (let row = table.firstChild; row; row = row.nextSibling) {
    const line = state.doc.lineAt(row.from)
    if (row.name === 'TableDelimiter') {
      align = line.text.trim().replace(/^\||\|$/g, '').split('|').map(s => {
        s = s.trim()
        return s.startsWith(':') && s.endsWith(':') ? 'center' : s.endsWith(':') ? 'right' : s.startsWith(':') ? 'left' : ''
      })
      continue
    }
    if (row.name !== 'TableHeader' && row.name !== 'TableRow') continue
    const pipes = row.getChildren('TableDelimiter').map(d => d.from)
    const bounds = [line.from + /^\s*/.exec(line.text)[0].length, ...pipes, line.to]
    const cellNodes = row.getChildren('TableCell')
    const cells = []
    for (let i = 0; i + 1 < bounds.length; i++) {
      const from = bounds[i] + (pipes.includes(bounds[i]) ? 1 : 0), to = bounds[i + 1]
      if ((i === 0 || i === bounds.length - 2) && !state.sliceDoc(from, to).trim()) continue // outer pipes
      const node = cellNodes.find(n => n.from >= from && n.to <= to)
      cells.push({
        offset: (node ? node.from : from) - base,
        content: node ? inlineSpec(state, node, node.from, node.to, dir) : [],
      })
    }
    rows.push(cells)
  }
  return { rows, align }
}

function resolveImage(src, dir) {
  src = src.replace(/^<|>$/g, '')
  if (/^[a-z][a-z0-9+.-]+:/i.test(src)) return src // URL scheme; a single letter is a drive
  try { src = decodeURI(src) } catch {}
  // Windows: dir is like C:\notes; use forward slashes and keep the drive letter unencoded.
  if (/^[a-z]:/i.test(dir)) { src = src.replace(/\\/g, '/'); dir = dir.replace(/\\/g, '/') }
  const abs = src.startsWith('/') || /^[a-z]:\//i.test(src) ? src : `${dir}/${src}`
  return 'file://' + (abs.startsWith('/') ? '' : '/') +
    abs.split('/').map(s => /^[a-z]:$/i.test(s) ? s : encodeURIComponent(s)).join('/')
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
      if ((m = /^(ATX|Setext)Heading(\d)$/.exec(name))) {
        const line = doc.lineAt(ref.from)
        if (m[1] === 'ATX') add(lineDeco(`cm-h cm-h${m[2]}`), line.from)
        else eachLine(ref.from, ref.to, (l, last) => { if (!last) add(lineDeco(`cm-h cm-h${m[2]}`), l.from) })
        const folded = !!foldedAt(state, line.to)
        if (folded || foldable(state, line.from, line.to))
          add(Decoration.widget({ widget: new FoldWidget(folded), side: -1 }), line.from)
      } else if (name === 'HeaderMark') {
        if (active) return
        if (parent?.startsWith('Setext')) return hide(ref.from, ref.to)
        const opening = node.parent.firstChild.from === ref.from
        if (opening) hide(ref.from, ref.to + (state.sliceDoc(ref.to, ref.to + 1) === ' ' ? 1 : 0))
        else hide(ref.from - (state.sliceDoc(ref.from - 1, ref.from) === ' ' ? 1 : 0), ref.to)
      } else if (name === 'Highlight') {
        add(markDeco('cm-highlight'), ref.from, ref.to)
      } else if (name === 'InlineMath') {
        if (active) add(markDeco('cm-math-src'), ref.from, ref.to)
        else add(Decoration.replace({ widget: new MathWidget(mathSource(state, node), false) }), ref.from, ref.to)
        return false
      } else if (name === 'BlockMath') {
        eachLine(ref.from, ref.to, line => add(lineDeco('cm-math-src'), line.from))
        return false
      } else if (name === 'EmphasisMark' || name === 'StrikethroughMark' || name === 'HighlightMark') {
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

// Fold placeholder: "frontmatter" for the YAML block, "…" for a heading's section.
export const foldPlaceholder = {
  preparePlaceholder: (state, range) => range.from < frontmatterEnd(state.doc) ? 'frontmatter' : '…',
  placeholderDOM(view, onclick, label) {
    const el = document.createElement('span')
    el.className = 'cm-foldPlaceholder'
    el.textContent = label
    el.title = 'Unfold'
    el.onclick = onclick
    return el
  },
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
        foldedRanges(u.startState) !== foldedRanges(u.state) ||
        u.startState.field(dirField) !== u.state.field(dirField))
      this.decorations = buildDecorations(u.view)
  }
}, { decorations: v => v.decorations })

// Tables and $$ math blocks are block widgets, which a ViewPlugin may not provide,
// so they live in a StateField. One the selection touches is left as raw markdown
// (styled by buildDecorations); a math block being edited shows its rendering below.
const containers = new Set(['Document', 'Blockquote', 'BulletList', 'OrderedList', 'ListItem'])

function tableDecorations(state) {
  const { doc } = state
  const dir = state.field(dirField)
  const fmEnd = frontmatterEnd(doc)
  const decos = []
  syntaxTree(state).iterate({
    enter(ref) {
      if (ref.name !== 'Table' && ref.name !== 'BlockMath') return containers.has(ref.name)
      const from = doc.lineAt(ref.from).from, to = doc.lineAt(ref.to).to
      if (from < fmEnd) return false
      const active = state.selection.ranges.some(r => r.from <= to && r.to >= from)
      if (ref.name === 'BlockMath') {
        const quoted = ref.node.parent?.name === 'Blockquote'
        const widget = new MathWidget(mathSource(state, ref.node), true, quoted)
        if (active) decos.push(Decoration.widget({ widget, block: true, side: 1 }).range(to))
        else decos.push(Decoration.replace({ widget, block: true }).range(from, to))
      } else if (!active) {
        const widget = new TableWidget(tableSpec(state, ref.node, dir), state.sliceDoc(from, to))
        decos.push(Decoration.replace({ widget, block: true }).range(from, to))
      }
      return false
    },
  })
  return Decoration.set(decos)
}

const tableField = StateField.define({
  create: tableDecorations,
  update(decos, tr) {
    if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state) ||
        tr.startState.field(dirField) !== tr.state.field(dirField))
      return tableDecorations(tr.state)
    return decos
  },
  provide: f => EditorView.decorations.from(f),
})

// Up/Down would skip over a rendered table or math block; stop on its first (or last) line instead.
const enterTable = forward => view => {
  const sel = view.state.selection.main
  if (!sel.empty) return false
  const target = view.moveVertically(sel, forward).head
  const lo = Math.min(sel.head, target), hi = Math.max(sel.head, target)
  let hit = null
  view.state.field(tableField).between(lo, hi, (from, to) => {
    if (from === to || from < lo || to > hi) return // the preview under a math block being edited
    hit = forward ? from : view.state.doc.lineAt(to).from
    if (forward) return false
  })
  if (hit === null) return false
  view.dispatch({ selection: { anchor: hit }, scrollIntoView: true })
  return true
}
const tableKeys = Prec.high(keymap.of([
  { key: 'ArrowDown', run: enterTable(true) },
  { key: 'ArrowUp', run: enterTable(false) },
]))

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
  return [dirField.init(() => dir), tableField, tableKeys, previewPlugin, linkClicks]
}
