#!/bin/sh
# Removes Chord Chemist and its menu entry. Saved progressions in the app profile are removed too.
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
rm -rf "$DATA/chord-chemist" "${XDG_CONFIG_HOME:-$HOME/.config}/chord-chemist"
rm -f "$DATA/applications/chord-chemist.desktop"
update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true
echo "Chord Chemist removed."
