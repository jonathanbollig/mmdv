import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t, tagHighlighter } from '@lezer/highlight'

// Colours that Obsidian CSS snippets may override are CSS variables, named as
// in Obsidian and given their defaults in style.css.
const c = {
  bg: 'var(--background-primary)',
  panel: '#26262c',
  code: 'var(--code-background)',
  fg: 'var(--text-normal)',
  bright: '#ececf2',
  dim: '#6e7086',
  accent: 'var(--text-accent)',
  link: 'var(--link-color)',
  selection: '#3a3f5c',
}
const sans = '"Noto Sans", system-ui, sans-serif'
const mono = '"Noto Sans Mono", monospace'

export const theme = EditorView.theme({
  '&': { height: '100vh', color: c.fg, backgroundColor: c.bg, fontSize: 'var(--font-text-size)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: sans, lineHeight: '1.6' },
  '.cm-content': { maxWidth: 'var(--file-line-width)', margin: '0 auto', padding: '40px 24px 40vh', caretColor: c.bright },
  '.cm-line': { padding: '0 4px' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: `2px solid ${c.bright}` },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: c.selection },
  '.cm-selectionMatch': { backgroundColor: '#33384f' },
  '.cm-searchMatch': { backgroundColor: '#5a4b1e', outline: '1px solid #8a7430' },
  '.cm-searchMatch-selected': { backgroundColor: '#7a6420' },

  '.cm-h': { lineHeight: '1.3', paddingTop: '0.5em', paddingBottom: '0.15em' },
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map(n => [`.cm-h${n}`,
    { fontSize: `var(--h${n}-size)`, color: `var(--h${n}-color)`, fontWeight: `var(--h${n}-weight)` }])),
  '.cm-fold-toggle': {
    position: 'absolute', transform: 'translateX(-130%)', display: 'inline-flex', alignItems: 'center', height: '1.3em',
    color: c.dim, cursor: 'pointer', opacity: '0', transition: 'opacity 0.15s',
  },
  '.cm-fold-toggle svg': { width: '0.7em', height: '0.7em', minWidth: '12px', minHeight: '12px' },
  '.cm-fold-toggle.cm-folded svg': { transform: 'rotate(-90deg)' },
  '.cm-line:hover .cm-fold-toggle, .cm-fold-toggle.cm-folded': { opacity: '1' },
  '.cm-fold-toggle:hover': { color: c.fg },

  '.cm-link': { color: c.link, textDecoration: 'underline', textDecorationColor: 'color-mix(in srgb, currentColor 40%, transparent)', textUnderlineOffset: '3px' },
  '.cm-highlight': { backgroundColor: 'var(--text-highlight-bg)', color: c.bright, borderRadius: '2px' },
  '.cm-math-src': { fontFamily: mono, fontSize: '0.9em' },
  '.cm-math': { cursor: 'text' },
  '.cm-math-block': { padding: '4px 0', overflowX: 'auto', cursor: 'text' },
  '.cm-math-block .katex-display': { margin: '0.4em 0' },
  '.cm-math-block .katex-error, .cm-math .katex-error': { fontFamily: mono, fontSize: '0.88em' },
  '.cm-table-widget mark': { backgroundColor: 'rgba(255, 208, 0, 0.28)', color: c.bright, borderRadius: '2px' },
  '.cm-inline-code': { color: 'var(--code-normal, currentColor)', fontFamily: mono, fontSize: '0.88em', backgroundColor: c.code, borderRadius: '4px', padding: '0.1em 0.3em' },
  '.cm-bullet': { color: c.accent, fontWeight: 'bold' },
  '.cm-list-number': { color: c.accent },
  '.cm-task-checkbox': { margin: '0 0.4em 0 0', verticalAlign: '-0.1em', width: '1em', height: '1em', cursor: 'pointer', accentColor: c.accent },
  '.cm-task-done': { color: c.dim, textDecoration: 'line-through' },
  '.cm-quote': { borderLeft: '3px solid var(--blockquote-border-color)', paddingLeft: '16px', color: 'var(--blockquote-color)' },
  '.cm-hr': {
    backgroundImage: `linear-gradient(${c.dim}, ${c.dim})`,
    backgroundSize: '100% 1px', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
  },
  // inline-block so several images on one line sit side by side (as in Obsidian).
  '.cm-image-wrap': { display: 'inline-block', position: 'relative', maxWidth: '100%', margin: '6px 8px 6px 0', verticalAlign: 'bottom' },
  '.cm-image': { display: 'block', maxWidth: '100%', borderRadius: '4px' },
  '.cm-image-handle': {
    position: 'absolute', right: '-5px', bottom: '-5px', width: '12px', height: '12px',
    borderRadius: '3px', background: c.accent, border: `2px solid ${c.bg}`,
    cursor: 'nwse-resize', opacity: '0', transition: 'opacity 0.15s', touchAction: 'none',
  },
  '.cm-image-wrap:hover .cm-image-handle': { opacity: '1' },
  '.cm-frontmatter': { color: c.dim, fontFamily: mono, fontSize: '0.8em' },
  '.cm-foldPlaceholder': { backgroundColor: c.code, border: 'none', color: c.dim, fontFamily: sans, fontSize: '0.85em', padding: '0 8px', margin: '0 6px', borderRadius: '4px' },
  '.cm-table': { fontFamily: mono, fontSize: '0.9em' },
  // Wide tables grow past the text column up to the window width, centred on the
  // column, and scroll sideways beyond that. Narrow ones stay left-aligned in it.
  // Words never break inside a cell (the editor's overflow-wrap: anywhere would
  // let columns shrink to one letter); long cells wrap at --table-cell-width.
  '.cm-table-widget': {
    overflowX: 'auto', padding: '6px 4px', cursor: 'text',
    width: 'max-content', minWidth: 'min(100%, calc(100vw - 64px))', maxWidth: 'calc(100vw - 64px)',
    position: 'relative', left: '50%', transform: 'translateX(-50%)',
    overflowWrap: 'normal', wordBreak: 'normal', whiteSpace: 'normal',
  },
  '.cm-table-cell': { maxWidth: 'var(--table-cell-width, 28em)' },
  '.cm-table-widget table': { borderCollapse: 'collapse', fontSize: '0.95em' },
  '.cm-table-widget th, .cm-table-widget td': { border: '1px solid #3c3c46', padding: '4px 12px', textAlign: 'left', verticalAlign: 'top' },
  '.cm-table-widget th': { color: c.bright, fontWeight: '600', backgroundColor: c.code },
  '.cm-table-widget tbody tr:nth-child(even)': { backgroundColor: 'rgba(255, 255, 255, 0.02)' },
  '.cm-table-image': { maxWidth: '240px', verticalAlign: 'middle' },

  '.cm-codeblock': { fontFamily: mono, fontSize: '0.88em', backgroundColor: c.code, padding: '0 16px' },
  '.cm-codeblock-begin': { borderTopLeftRadius: '6px', borderTopRightRadius: '6px', paddingTop: '4px', position: 'relative' },
  '.cm-codeblock-end': { borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px', paddingBottom: '4px' },
  '.cm-fence': { fontSize: '0.7em', lineHeight: '1.2' },
  '.cm-code-lang': { color: c.dim },
  '.cm-code-copy': {
    position: 'absolute', right: '8px', top: '6px', zIndex: '1',
    display: 'flex', padding: '4px', border: 'none', borderRadius: '4px',
    background: 'transparent', color: c.dim, cursor: 'pointer', opacity: '0.6',
  },
  '.cm-code-copy:hover': { opacity: '1', color: c.fg, backgroundColor: 'rgba(255, 255, 255, 0.08)' },

  '.cm-panels': { backgroundColor: c.panel, color: c.fg },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #34343c' },
  '.cm-textfield': { backgroundColor: c.bg, color: c.fg, border: '1px solid #3c3c46', borderRadius: '3px' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: '#34343c', color: c.fg, border: '1px solid #44444e', borderRadius: '3px' },
  '.cm-panel.cm-search label': { color: c.fg },
}, { dark: true })

// Obsidian's class names on top of the generated ones, for CSS snippets.
const obsidianClasses = syntaxHighlighting(tagHighlighter([
  { tag: t.strong, class: 'cm-strong' },
  { tag: t.emphasis, class: 'cm-em' },
  { tag: t.strikethrough, class: 'cm-strikethrough' },
]))

export const highlighting = [obsidianClasses, syntaxHighlighting(HighlightStyle.define([
  // markdown
  { tag: t.emphasis, fontStyle: 'italic', color: 'var(--italic-color, currentColor)' },
  { tag: t.strong, fontWeight: 'var(--bold-weight)', color: 'var(--bold-color)' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: c.link },
  { tag: t.url, color: c.dim },
  { tag: [t.processingInstruction, t.contentSeparator], color: c.dim },
  { tag: t.monospace, fontFamily: mono },
  { tag: t.quote, color: 'var(--blockquote-color)' },
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
]))]
