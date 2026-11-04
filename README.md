# Minimal Obsidian-Style MarkDown Viewer
Lack of a minimal viewer that allowed editing similar to obsidian made me prompt claude. This is the result. No manual labor done here. Feel free to adapt to your use case 🙂

The following part is the summary by claude:

---

**mmdv** is a small desktop app for opening loose `.md` files and editing them with inline live preview: markdown syntax is hidden and rendered as you type, and shown again on the line your cursor is on. No vault, no sidebar, no plugins. One file, one window.

It's about 900 lines of code: [CodeMirror 6](https://codemirror.net/) for the editor, a thin [Electron](https://www.electronjs.org/) shell, bundled with esbuild. No UI framework.

## Features

- Live preview for headings, **bold**, *italic*, ~~strikethrough~~, ==highlight==, `inline code`, links, blockquotes and horizontal rules
- LaTeX math rendered with [KaTeX](https://katex.org/): `$inline$` and `$$display$$` blocks (a block being edited shows its rendering below the source)
- Typing `` ` ``, `(`, `[`, `{`, `"`, `'`, `*`, `_`, `~`, `=`, `$` or `<` with text selected wraps the selection; press `*` twice for bold, `=` twice for highlight
- Bullet, numbered and task lists, with clickable checkboxes
- Fenced code blocks with syntax highlighting and a copy button
- Inline images (relative paths are resolved from the file's folder)
- Tables rendered as real tables, with column alignment; click a cell to edit the markdown
- YAML frontmatter folded away by default
- Collapsible headings: hover a heading and click the chevron to fold its section (Ctrl+Shift+[ / ] at the cursor, Ctrl+Alt+[ / ] for all)
- Ctrl+click opens links in your default browser
- `[[wiki links]]` are styled with their brackets hidden (not clickable yet)
- Search (Ctrl+F), undo/redo and normal keyboard behaviour (e.g. Ctrl+Backspace deletes a word)
- Auto saves a second after you stop typing, and on close; Ctrl+S saves right away. An untitled document is only saved with Ctrl+S, and closing it with unsaved changes warns you
- Reloads the file when it changes on disk (asks first if you have unsaved edits)
- Zoom with Ctrl +/- (Ctrl+0 resets), Ctrl+mouse wheel or touchpad pinch
- Dark theme with a centred, readable line width

## Requirements

- Node.js and npm (to build)
- A system-wide Electron install. The launcher calls `electron44` (the Arch Linux package name). On other systems, change the `electron44` in [`bin/mmdv`](bin/mmdv) to whatever your Electron binary is called.

Developed and tested on Linux (KDE Plasma, Wayland) only.

## Install

```sh
git clone https://github.com/jonathanbollig/mmdv.git
cd mmdv
npm install
./install.sh
```

`install.sh` builds the app, links the `mmdv` launcher into `~/.local/bin` and installs a desktop entry into `~/.local/share/applications`. Nothing is installed system-wide.

To make mmdv the default app for markdown files:

```sh
xdg-mime default mmdv.desktop text/markdown
```

## Usage

```sh
mmdv notes.md
```

Several files open in separate windows. A path that doesn't exist yet is created on first save. Without a file argument you get an empty document, and Ctrl+S asks where to save it.

## Not yet supported

Following wiki links, callouts and an open-file dialog.

## License

[MIT](LICENSE)

Not affiliated with or endorsed by Obsidian or Dynalist Inc. "Obsidian" is only used to describe the editing style.
