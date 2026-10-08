# Draws the loading screen's moving parts as little PNG sprites with transparency, in the light
# palette's solid colours: the same shapes placeholder-lab.py used to draw into the scene, which
# now leaves them out (--still) so the page can animate them. A note and a bubble that float out
# of the flask, a bubble in the liquid, and the burner flame. Drawn at 4x like the scene, shrunk,
# then kept as solid pixels (no dithering).
# Runs under Calibre's bundled Python/Qt:
#   "C:\Program Files\Calibre2\calibre-debug.exe" -e tools\splash-sprites.py -- src
import os
import sys
from qt.core import QImage, QPainter, QColor, QPen, QPainterPath, QPointF, QRectF, Qt

out_dir = [a for a in sys.argv if not a.startswith('--')][-1]
S = 4
INK, BLUE, PAPER = QColor(0x1F, 0x1A, 0x13), QColor(0x2B, 0x6C, 0xB0), QColor(0xF8, 0xF1, 0xE3)


def grey(v):
    return QColor(v, v, v)


def canvas(w, h):
    img = QImage(w, h, QImage.Format.Format_ARGB32)
    img.fill(Qt.GlobalColor.transparent)
    p = QPainter(img)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    p.setPen(QPen(Qt.PenStyle.NoPen))
    return img, p


def sprite(img, name, colour_of):
    """Shrink by S and keep the solid pixels; colour_of(tone) picks the palette colour."""
    small = img.scaled(img.width() // S, img.height() // S, Qt.AspectRatioMode.IgnoreAspectRatio,
                       Qt.TransformationMode.SmoothTransformation)
    out = QImage(small.size(), QImage.Format.Format_ARGB32)
    out.fill(Qt.GlobalColor.transparent)
    for y in range(small.height()):
        for x in range(small.width()):
            c = small.pixelColor(x, y)
            if c.alpha() >= 100:
                out.setPixelColor(x, y, colour_of(c.red()))
    path = os.path.join(out_dir, name)
    out.save(path)
    print(f"{path}: {out.width()}x{out.height()}")


# Eighth note, 11x14, blue.
img, p = canvas(44, 56)
p.setBrush(grey(255))
p.translate(12, 46)  # the note head's centre
p.save()
p.rotate(-22)
p.drawEllipse(QPointF(0, 0), 10, 7)
p.restore()
p.drawRect(QRectF(7, -44, 4, 44))
flag = QPainterPath()
flag.moveTo(11, -44)
flag.cubicTo(24, -36, 28, -24, 20, -12)
flag.cubicTo(22, -24, 18, -30, 11, -32)
flag.closeSubpath()
p.drawPath(flag)
p.end()
sprite(img, 'note.png', lambda v: BLUE)

# A bubble in the air: a 5x5 ring, ink.
img, p = canvas(20, 20)
p.setBrush(Qt.BrushStyle.NoBrush)
p.setPen(QPen(grey(255), 4))
p.drawEllipse(QPointF(10, 10), 7, 7)
p.end()
sprite(img, 'bubble.png', lambda v: INK)

# A bubble in the liquid: a 3x3 dot, paper.
img, p = canvas(12, 12)
p.setBrush(grey(255))
p.drawEllipse(QPointF(6, 6), 5.5, 5.5)
p.end()
sprite(img, 'drop.png', lambda v: PAPER)

# The burner flame, 9x12: blue with a paper core (the scene's flame, 174-206 x 288-332).
img, p = canvas(36, 48)
outer = QPainterPath()
outer.moveTo(18, 2)
outer.cubicTo(34, 20, 34, 40, 18, 46)
outer.cubicTo(2, 40, 2, 20, 18, 2)
p.setBrush(grey(85))
p.drawPath(outer)
inner = QPainterPath()
inner.moveTo(18, 18)
inner.cubicTo(26, 28, 26, 40, 18, 44)
inner.cubicTo(10, 40, 10, 28, 18, 18)
p.setBrush(grey(255))
p.drawPath(inner)
p.end()
sprite(img, 'flame.png', lambda v: PAPER if v > 170 else BLUE)
