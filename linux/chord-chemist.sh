#!/bin/sh
# Opens Chord Chemist in its own app window (Chromium-family browsers), else Firefox.
DIR="$(cd "$(dirname "$0")" && pwd)"
PAGE="$DIR/chord-chemist.html"
[ -f "$PAGE" ] || PAGE=/usr/share/chord-chemist/chord-chemist.html
# ---- launch ----
CONF="${XDG_CONFIG_HOME:-$HOME/.config}/chord-chemist"

# Snap browsers (stock Ubuntu) can't read /usr/share or hidden folders in home,
# so hand them a copy of the page inside their own snap folder.
snap_copy() {
  BASE="$HOME/snap/$1/common/chord-chemist"
  mkdir -p "$BASE"
  cp "$PAGE" "$BASE/chord-chemist.html"
  PAGE="$BASE/chord-chemist.html"
  CONF="$BASE"
}

for b in chromium chromium-browser google-chrome google-chrome-stable brave-browser microsoft-edge; do
  p="$(command -v "$b" 2>/dev/null)" || continue
  case "$p" in /snap/*) snap_copy "$b" ;; esac
  mkdir -p "$CONF/browser"
  exec "$p" --app="file://$PAGE" --window-size=1400,940 --user-data-dir="$CONF/browser" \
    --no-first-run --no-default-browser-check
done
if p="$(command -v firefox 2>/dev/null)"; then
  case "$p" in /snap/*) snap_copy firefox ;; esac
  exec "$p" --new-window "file://$PAGE"
fi
exec xdg-open "file://$PAGE"
