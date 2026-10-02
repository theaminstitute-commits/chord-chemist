#!/bin/sh
# Installs Chord Chemist for the current user (no sudo) and adds it to the menu.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DEST="$DATA/chord-chemist"
APPS="$DATA/applications"

mkdir -p "$DEST" "$APPS"
cp "$SRC/chord-chemist.html" "$SRC/chord-chemist.sh" "$SRC/chord-chemist.svg" "$DEST/"
chmod +x "$DEST/chord-chemist.sh"

cat > "$APPS/chord-chemist.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Chord Chemist
Comment=Build guitar chord progressions from legal chord choices and hear them
Exec="$DEST/chord-chemist.sh"
Icon=$DEST/chord-chemist.svg
Terminal=false
Categories=AudioVideo;Audio;Music;Education;
DESKTOP
chmod +x "$APPS/chord-chemist.desktop"
update-desktop-database "$APPS" >/dev/null 2>&1 || true

echo "Chord Chemist installed to $DEST"
echo "Open it from the menu (Sound & Video / Education), or run: $DEST/chord-chemist.sh"
if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1 \
   && ! command -v google-chrome >/dev/null 2>&1; then
  echo "Tip: install Chromium (sudo apt install chromium) to get a separate app window; it opens in Firefox until then."
fi
