# Draws the placeholder loading-screen art: a small chemistry bench (flask over a burner,
# a conical flask, test tubes) with bubbles that turn into music notes. Greyscale at 4x the
# final size; tools/cga-splash.py then shrinks and dithers it to the 4-colour palette.
# Runs under Calibre's bundled Python/Qt:
#   "C:\Program Files\Calibre2\calibre-debug.exe" -e tools\placeholder-lab.py -- art\placeholder-lab.png
import sys
from qt.core import (QImage, QPainter, QColor, QPen, QBrush, QPainterPath, QPointF, QRectF,
                     QRadialGradient, QLinearGradient, Qt)

W, H = 416, 436
out = sys.argv[-1]

def grey(v):
    return QColor(v, v, v)

img = QImage(W, H, QImage.Format.Format_RGB32)
p = QPainter(img)
p.setRenderHint(QPainter.RenderHint.Antialiasing)

# Back wall: dark, a little lighter behind the glassware.
bg = QRadialGradient(QPointF(210, 200), 300)
bg.setColorAt(0, grey(52))
bg.setColorAt(1, grey(6))
p.fillRect(0, 0, W, H, QBrush(bg))

# Bench top.
bench = QLinearGradient(0, 360, 0, H)
bench.setColorAt(0, grey(120))
bench.setColorAt(1, grey(70))
p.fillRect(QRectF(0, 360, W, H - 360), QBrush(bench))
p.fillRect(QRectF(0, 358, W, 5), grey(200))

no_pen = QPen(Qt.PenStyle.NoPen)
glass = QPen(grey(236), 6)
shine = QPen(grey(255), 5, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap)

# Ring stand: base, rod, clamp arm.
p.setPen(no_pen)
p.setBrush(grey(150))
p.drawRect(QRectF(34, 346, 120, 13))
p.drawRect(QRectF(62, 96, 9, 252))
p.drawRect(QRectF(62, 124, 124, 7))

# Round-bottom flask with liquid.
flask = QPainterPath()
flask.addEllipse(QPointF(190, 215), 68, 68)
neck = QPainterPath()
neck.addRect(QRectF(176, 108, 28, 60))
flask = flask.united(neck)
p.setBrush(grey(40))
p.drawPath(flask)
p.save()
p.setClipPath(flask)
p.fillRect(QRectF(0, 206, W, 200), grey(170))
p.fillRect(QRectF(0, 204, W, 5), grey(230))
for x, y, r in [(170, 250, 7), (205, 236, 5), (188, 268, 4), (214, 262, 6)]:
    p.setBrush(grey(235))
    p.drawEllipse(QPointF(x, y), r, r)
p.restore()
p.setBrush(Qt.BrushStyle.NoBrush)
p.setPen(glass)
p.drawPath(flask)
p.drawRect(QRectF(171, 102, 38, 8))
p.setPen(shine)
p.drawArc(QRectF(138, 163, 104, 104), 110 * 16, 50 * 16)

# Burner and flame.
p.setPen(no_pen)
p.setBrush(grey(140))
p.drawRect(QRectF(172, 334, 36, 26))
p.drawRect(QRectF(164, 352, 52, 8))
outer = QPainterPath()
outer.moveTo(190, 288)
outer.cubicTo(206, 306, 206, 326, 190, 332)
outer.cubicTo(174, 326, 174, 306, 190, 288)
p.setBrush(grey(200))
p.drawPath(outer)
inner = QPainterPath()
inner.moveTo(190, 304)
inner.cubicTo(198, 314, 198, 326, 190, 330)
inner.cubicTo(182, 326, 182, 314, 190, 304)
p.setBrush(grey(255))
p.drawPath(inner)

# Conical (Erlenmeyer) flask.
cone = QPainterPath()
cone.moveTo(246, 358)
cone.lineTo(354, 358)
cone.lineTo(313, 246)
cone.lineTo(313, 210)
cone.lineTo(287, 210)
cone.lineTo(287, 246)
cone.closeSubpath()
p.setBrush(grey(45))
p.drawPath(cone)
p.save()
p.setClipPath(cone)
p.fillRect(QRectF(0, 304, W, 60), grey(85))
p.fillRect(QRectF(0, 302, W, 4), grey(200))
p.restore()
p.setBrush(Qt.BrushStyle.NoBrush)
p.setPen(glass)
p.drawPath(cone)
p.drawRect(QRectF(282, 203, 36, 8))
p.setPen(shine)
p.drawLine(QPointF(279, 320), QPointF(295, 262))

# Test tubes in a rack.
p.setPen(no_pen)
p.setBrush(grey(120))
p.drawRect(QRectF(354, 292, 60, 7))
p.drawRect(QRectF(356, 299, 5, 60))
p.drawRect(QRectF(405, 299, 5, 60))
for x, level, shade in [(361, 300, 200), (380, 318, 90), (399, 286, 150)]:
    tube = QPainterPath()
    tube.addRoundedRect(QRectF(x, 240, 12, 104), 6, 6)
    p.setPen(no_pen)
    p.setBrush(grey(40))
    p.drawPath(tube)
    p.save()
    p.setClipPath(tube)
    p.fillRect(QRectF(x - 2, level, 18, 120), grey(shade))
    p.restore()
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.setPen(QPen(grey(236), 4))
    p.drawPath(tube)

# Bubbles rising out of the flask...
p.setPen(QPen(grey(240), 3))
for x, y, r in [(196, 88, 6), (184, 66, 4.5), (201, 46, 5)]:
    p.drawEllipse(QPointF(x, y), r, r)

# ...turning into music notes.
def eighth_note(x, y, s):
    p.save()
    p.translate(x, y)
    p.scale(s, s)
    p.setPen(no_pen)
    p.setBrush(grey(255))
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
    p.restore()

eighth_note(236, 66, 1.0)
eighth_note(286, 36, 0.8)
eighth_note(132, 44, 0.7)

p.end()
img.save(out)
print(f"{out}: {W}x{H}")
