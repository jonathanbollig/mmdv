import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const c = {
  bg: '#1e1e23',
  panel: '#26262c',
  code: 'rgba(255, 255, 255, 0.045)', // translucent so the selection layer shows through
  fg: '#d3d3db',
  bright: '#ececf2',
  dim: '#6e7086',
  accent: '#8c9cf2',
  link: '#8ab4f8',
  selection: '#3a3f5c',
}
const sans = '"Noto Sans", system-ui, sans-serif'
const mono = '"Noto Sans Mono", monospace'

export const theme = EditorView.theme({
  '&': { height: '100vh', color: c.fg, backgroundColor: c.bg, fontSize: '16px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: sans, lineHeight: '1.6' },
  '.cm-content': { maxWidth: '760px', margin: '0 auto', padding: '40px 24px 40vh', caretColor: c.bright },
  '.cm-line': { padding: '0 4px' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: `2px solid ${c.bright}` },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: c.selection },
  '.cm-selectionMatch': { backgroundColor: '#33384f' },
  '.cm-searchMatch': { backgroundColor: '#5a4b1e', outline: '1px solid #8a7430' },
  '.cm-searchMatch-selected': { backgroundColor: '#7a6420' },

  '.cm-h': { color: c.bright, fontWeight: '600', lineHeight: '1.3', paddingTop: '0.5em', paddingBottom: '0.15em' },
  '.cm-h1': { fontSize: '1.9em' },
  '.cm-h2': { fontSize: '1.55em' },
  '.cm-h3': { fontSize: '1.3em' },
  '.cm-h4': { fontSize: '1.15em' },
  '.cm-h5': { fontSize: '1.05em' },
  '.cm-h6': { fontSize: '1em', color: c.fg },

  '.cm-link': { color: c.link, textDecoration: 'underline', textDecorationColor: '#8ab4f866', textUnderlineOffset: '3px' },
  '.cm-inline-code': { fontFamily: mono, fontSize: '0.88em', backgroundColor: c.code, borderRadius: '4px', padding: '0.1em 0.3em' },
  '.cm-bullet': { color: c.accent, fontWeight: 'bold' },
  '.cm-list-number': { color: c.accent },
  '.cm-task-checkbox': { margin: '0 0.4em 0 0', verticalAlign: '-0.1em', width: '1em', height: '1em', cursor: 'pointer', accentColor: c.accent },
  '.cm-task-done': { color: c.dim, textDecoration: 'line-through' },
  '.cm-quote': { borderLeft: `3px solid ${c.accent}`, paddingLeft: '16px', color: '#b8b8c6' },
  '.cm-hr': {
    backgroundImage: `linear-gradient(${c.dim}, ${c.dim})`,
    backgroundSize: '100% 1px', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
  },
  '.cm-image': { display: 'block', maxWidth: '100%', margin: '6px 0', borderRadius: '4px' },
  '.cm-frontmatter': { color: c.dim, fontFamily: mono, fontSize: '0.8em' },
  '.cm-foldPlaceholder': { backgroundColor: c.code, border: 'none', color: c.dim, fontFamily: sans, fontSize: '0.85em', padding: '0 8px', margin: '0 6px', borderRadius: '4px' },
  '.cm-table': { fontFamily: mono, fontSize: '0.9em' },

  '.cm-codeblock': { fontFamily: mono, fontSize: '0.88em', backgroundColor: c.code, padding: '0 16px' },
  '.cm-codeblock-begin': { borderTopLeftRadius: '6px', borderTopRightRadius: '6px', paddingTop: '4px' },
  '.cm-codeblock-end': { borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px', paddingBottom: '4px' },
  '.cm-fence': { fontSize: '0.7em', lineHeight: '1.2' },
  '.cm-code-lang': { color: c.dim },

  '.cm-panels': { backgroundColor: c.panel, color: c.fg },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #34343c' },
  '.cm-textfield': { backgroundColor: c.bg, color: c.fg, border: '1px solid #3c3c46', borderRadius: '3px' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: '#34343c', color: c.fg, border: '1px solid #44444e', borderRadius: '3px' },
  '.cm-panel.cm-search label': { color: c.fg },
}, { dark: true })

export const highlighting = syntaxHighlighting(HighlightStyle.define([
  // markdown
  { tag: t.heading, color: c.bright, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold', color: c.bright },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: c.link },
  { tag: t.url, color: c.dim },
  { tag: [t.processingInstruction, t.contentSeparator], color: c.dim },
  { tag: t.monospace, fontFamily: mono },
  { tag: t.quote, color: '#b8b8c6' },
  // code
  { tag: t.comment, color: c.dim, fontStyle: 'italic' },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: '#c792ea' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#c3e88d' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#f78c6c' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#82aaff' },
  { tag: [t.typeName, t.className, t.namespace], color: '#ffcb6b' },
  { tag: [t.propertyName, t.attributeName], color: '#9cdcfe' },
  { tag: [t.operator, t.punctuation], color: '#89ddff' },
  { tag: [t.meta, t.labelName], color: '#a0a4c0' },
  { tag: t.invalid, color: '#ff5370' },
]))
