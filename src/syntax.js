// Markdown syntax extensions for the Lezer parser: ==highlight== and $math$.
import { tags as t } from '@lezer/highlight'

const punct = /[\p{S}\p{P}]/u
const space = /\s|^$/

// ==highlight==, delimited like ~~strikethrough~~.
const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' }

export const Highlight = {
  defineNodes: [{ name: 'Highlight' }, { name: 'HighlightMark', style: t.processingInstruction }],
  parseInline: [{
    name: 'Highlight',
    parse(cx, next, pos) {
      if (next !== 61 /* = */ || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1
      const before = cx.slice(pos - 1, pos), after = cx.slice(pos + 2, pos + 3)
      const sBefore = space.test(before), sAfter = space.test(after)
      const pBefore = punct.test(before), pAfter = punct.test(after)
      return cx.addDelimiter(HighlightDelim, pos, pos + 2,
        !sAfter && (!pAfter || sBefore || pBefore),
        !sBefore && (!pBefore || sAfter || pAfter))
    },
    after: 'Emphasis',
  }],
}

// Inline $math$ and $$display math$$ inside a line, with Obsidian's rules:
// no space after the opening $, none before the closing $, and no digit right
// after it (so "$5 and $10" stays text). A $$ block on its own lines is BlockMath.
const isMathLine = line => line.text.startsWith('$$', line.pos)

export const MathSyntax = {
  defineNodes: [
    { name: 'InlineMath' },
    { name: 'BlockMath', block: true },
    { name: 'MathMark', style: t.processingInstruction },
  ],
  parseInline: [{
    name: 'InlineMath',
    parse(cx, next, pos) {
      if (next !== 36 /* $ */) return -1
      const len = cx.char(pos + 1) === 36 ? 2 : 1
      const start = pos + len
      if (start >= cx.end || /\s/.test(cx.slice(start, start + 1))) return -1
      for (let i = start + 1; i + len <= cx.end; i++) {
        const ch = cx.char(i)
        if (ch === 10 /* newline */) return -1
        if (ch === 92 /* \ */) { i++; continue }
        if (ch !== 36 || (len === 2 && cx.char(i + 1) !== 36)) continue
        if (len === 1 && (/\s/.test(cx.slice(i - 1, i)) || /\d/.test(cx.slice(i + 1, i + 2)))) return -1
        return cx.addElement(cx.elt('InlineMath', pos, i + len, [
          cx.elt('MathMark', pos, start), cx.elt('MathMark', i, i + len),
        ]))
      }
      return -1
    },
    before: 'Emphasis',
  }],
  parseBlock: [{
    name: 'BlockMath',
    parse(cx, line) {
      if (!isMathLine(line)) return false
      const from = cx.lineStart + line.pos
      const marks = [cx.elt('MathMark', from, from + 2)]
      const rest = line.text.slice(line.pos + 2).trimEnd()
      let to = cx.lineStart + line.text.length
      if (rest.length >= 2 && rest.endsWith('$$')) {
        // $$ ... $$ on one line
        marks.push(cx.elt('MathMark', cx.lineStart + line.pos + 2 + rest.length - 2, cx.lineStart + line.pos + 2 + rest.length))
        cx.nextLine()
      } else {
        while (cx.nextLine() && line.depth >= cx.stack.length) {
          marks.push(...line.markers)
          to = cx.lineStart + line.text.length
          const text = line.text.trimEnd()
          if (text.endsWith('$$')) {
            marks.push(cx.elt('MathMark', cx.lineStart + text.length - 2, cx.lineStart + text.length))
            cx.nextLine()
            break
          }
        }
      }
      cx.addElement(cx.elt('BlockMath', from, to, marks))
      return true
    },
    endLeaf: (cx, line) => isMathLine(line),
    before: 'FencedCode',
  }],
}
