#!/bin/sh
# Per-user install: launcher in ~/.local/bin, desktop entry in ~/.local/share/applications.
set -e
dir=$(dirname "$(readlink -f "$0")")
cd "$dir"
npm run build >/dev/null
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
ln -sf "$dir/bin/mmdv" "$HOME/.local/bin/mmdv"
sed "s|@BIN@|$HOME/.local/bin/mmdv|" mmdv.desktop.in > "$HOME/.local/share/applications/mmdv.desktop"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "Installed. To make mmdv the default for markdown files:"
echo "  xdg-mime default mmdv.desktop text/markdown"
