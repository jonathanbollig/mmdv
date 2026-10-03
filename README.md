# Minimal Obsidian-Style MarkDown Viewer
Lack of a minimal viewer that allowed editing similar to obsidian made me prompt claude. This is the result. No manual labor done here. Feel free to adapt to your use case 🙂

The following part is the summary by claude:

---

**mmdv** is a small desktop app for opening loose `.md` files and editing them with inline live preview: markdown syntax is hidden and rendered as you type, and shown again on the line your cursor is on. No vault, no sidebar, no plugins. One file, one window.

It's about 600 lines of code: [CodeMirror 6](https://codemirror.net/) for the editor, a thin [Electron](https://www.electronjs.org/) shell, bundled with esbuild. No UI framework.

## Features

- Live preview for headings, **bold**, *italic*, ~~strikethrough~~, `inline code`, links, blockquotes and horizontal rules
- Bullet, numbered and task lists, with clickable checkboxes
- Fenced code blocks with syntax highlighting and a copy button
- Inline images (relative paths are resolved from the file's folder)
- YAML frontmatter folded away by default
- Ctrl+click opens links in your default browser
- `[[wiki links]]` are styled with their brackets hidden (not clickable yet)
- Search (Ctrl+F), undo/redo and normal keyboard behaviour (e.g. Ctrl+Backspace deletes a word)
- Ctrl+S saves; you get a warning if you close with unsaved changes
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

Rendered tables (they're shown as styled monospace text), following wiki links, LaTeX math, callouts, an open-file dialog and reloading files changed on disk.

## License

[MIT](LICENSE)

Not affiliated with or endorsed by Obsidian or Dynalist Inc. "Obsidian" is only used to describe the editing style.
