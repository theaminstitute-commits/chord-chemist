# Turns an image into 4-colour CGA-style pixel art in the app's palette (the loading screen).
# Runs under Calibre's bundled Python (it ships Qt, and this PC has no other Python):
#   "C:\Program Files\Calibre2\calibre-debug.exe" -e tools\cga-splash.py -- art\placeholder-lab.png src\splash.png 104 --raw
# --raw keeps drawn artwork's tones as drawn (0/85/170/255 are the four solid colours);
# without it the tones are stretched to fill the palette, which suits photos.
import sys
from qt.core import QImage, Qt, qRgb

raw = '--raw' in sys.argv
args = [a for a in sys.argv if not a.startswith('--')]
src, dst, width = args[-3], args[-2], int(args[-1])

# CGA's black / magenta / cyan / white, re-cast in the app's own colours:
# walnut cabinet, oxblood, brass, parchment.
PALETTE = [(0x2E, 0x1F, 0x15), (0x7C, 0x21, 0x1A), (0xB8, 0x91, 0x3F), (0xEF, 0xE2, 0xC3)]
# 4x4 Bayer matrix: the ordered dither those old 4-colour screens were known for.
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
GAMMA = 1.0 if raw else 0.9

image = QImage(src).convertToFormat(QImage.Format.Format_Grayscale8)
height = round(image.height() * width / image.width())
small = image.scaled(width, height, Qt.AspectRatioMode.IgnoreAspectRatio,
                     Qt.TransformationMode.SmoothTransformation)
grey = [[small.pixelColor(x, y).red() for x in range(width)] for y in range(height)]

if raw:
    lo, hi = 0, 255
else:
    # Stretch the tones so the darkest 2% and brightest 2% hit the ends of the palette.
    flat = sorted(v for row in grey for v in row)
    lo, hi = flat[int(len(flat) * 0.02)], flat[int(len(flat) * 0.98)]

out = QImage(width, height, QImage.Format.Format_Indexed8)
out.setColorCount(len(PALETTE))
for i, (r, g, b) in enumerate(PALETTE):
    out.setColor(i, qRgb(r, g, b))
levels = len(PALETTE) - 1
for y in range(height):
    for x in range(width):
        v = min(1.0, max(0.0, (grey[y][x] - lo) / max(1, hi - lo))) ** GAMMA
        t = (BAYER[y % 4][x % 4] + 0.5) / 16
        out.setPixel(x, y, min(levels, int(v * levels + t)))
out.save(dst)
print(f"{dst}: {width}x{height}, tones {lo}-{hi}")
