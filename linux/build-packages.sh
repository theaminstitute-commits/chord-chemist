#!/bin/sh
# Builds the Linux Mint / Ubuntu packages from dist/chord-chemist.html (run `node build.js` first).
# Run on Linux (or WSL):  sh linux/build-packages.sh
#   dist/chord-chemist_<version>_all.deb  double-click to install (menu entry + icon)
#   dist/ChordChemist.run                 single file, runs without installing
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${VERSION:-0.1.0}"
HTML="$ROOT/dist/chord-chemist.html"
[ -f "$HTML" ] || { echo "Missing $HTML - run: node build.js" >&2; exit 1; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---- .deb ----
PKG="$WORK/chord-chemist"
mkdir -p "$PKG/DEBIAN" "$PKG/usr/bin" "$PKG/usr/share/chord-chemist" \
  "$PKG/usr/share/applications" "$PKG/usr/share/icons/hicolor/scalable/apps"
install -m 644 "$HTML" "$PKG/usr/share/chord-chemist/chord-chemist.html"
install -m 755 "$ROOT/linux/chord-chemist.sh" "$PKG/usr/bin/chord-chemist"
install -m 644 "$ROOT/linux/chord-chemist.svg" "$PKG/usr/share/icons/hicolor/scalable/apps/chord-chemist.svg"
cat > "$PKG/usr/share/applications/chord-chemist.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Chord Chemist
Comment=Build guitar chord progressions from legal chord choices and hear them
Exec=chord-chemist
Icon=chord-chemist
Terminal=false
Categories=AudioVideo;Audio;Music;Education;
DESKTOP
chmod 644 "$PKG/usr/share/applications/chord-chemist.desktop"
SIZE="$(du -sk "$PKG/usr" | cut -f1)"
cat > "$PKG/DEBIAN/control" <<CONTROL
Package: chord-chemist
Version: $VERSION
Architecture: all
Maintainer: Philip van der Walt <theaminstitute@gmail.com>
Installed-Size: $SIZE
Recommends: chromium | google-chrome-stable | firefox
Section: sound
Priority: optional
Description: Guitar chord-progression workbench
 Pick a progression and a starting chord; each bar lists only the chords that
 are legal there (diatonic, altered, substitutes, secondary dominants, passing
 chords). Drag them in, see diagrams and the fretboard, and hear it played.
CONTROL
dpkg-deb --root-owner-group --build "$PKG" "$ROOT/dist/chord-chemist_${VERSION}_all.deb" >/dev/null

# ---- single-file .run ----
RUN="$ROOT/dist/ChordChemist.run"
{
  cat <<'HEADER'
#!/bin/sh
# Chord Chemist - single-file app for Linux Mint / Ubuntu. Nothing to install:
# right-click > Properties > Permissions > "Allow executing file as program",
# then double-click it (choose "Run").
PAGE="${XDG_DATA_HOME:-$HOME/.local/share}/chord-chemist/chord-chemist.html"
mkdir -p "$(dirname "$PAGE")"
sed '1,/^__PAYLOAD_BELOW__$/d' "$0" > "$PAGE"
HEADER
  sed -n '/^# ---- launch ----$/,$p' "$ROOT/linux/chord-chemist.sh"
  printf 'exit 0\n__PAYLOAD_BELOW__\n'
  cat "$HTML"
} > "$RUN"
chmod 755 "$RUN"
echo "Built dist/chord-chemist_${VERSION}_all.deb and dist/ChordChemist.run (version $VERSION)"
