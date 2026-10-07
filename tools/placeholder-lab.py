# Draws the placeholder loading-screen art: a small chemistry bench (flask over a burner,
# a conical flask, test tubes) with bubbles that turn into music notes. Greyscale at 4x the
# final size; tools/cga-splash.py then shrinks and dithers it to a 4-colour palette.
# With --raw dithering, tone 0/85/170/255 are the palette's four solid colours.
#   dark (default): dark wall, light glassware -- for the dark theme
#   --light:        paper wall, ink glassware, blue liquid and notes -- for the light theme
# Runs under Calibre's bundled Python/Qt:
#   "C:\Program Files\Calibre2\calibre-debug.exe" -e tools\placeholder-lab.py -- art\placeholder-lab.png
#   "C:\Program Files\Calibre2\calibre-debug.exe" -e tools\placeholder-lab.py -- art\placeholder-lab-light.png --light
import sys
from qt.core import (QImage, QPainter, QColor, QPen, QBrush, QPainterPath, QPointF, QRectF,
                     QRadialGradient, QLinearGradient, Qt)

W, H = 416, 436
light = '--light' in sys.argv
out = [a for a in sys.argv if not a.startswith('--')][-1]

# Tone of each part of the scene (0 = darkest palette colour, 255 = lightest).
TONES = {
    'wall': (52, 6),          # centre, edges
    'bench': (120, 70),       # top, bottom
    'bench_edge': 200,
    'glass': 236, 'shine': 255, 'inside': 40,
    'stand': 150,
    'flask_liquid': 170, 'meniscus': 230, 'bubble_in': 235,
    'burner': 140, 'flame': 200, 'flame_core': 255,
    'cone_inside': 45, 'cone_liquid': 85, 'cone_meniscus': 200,
    'rack': 120, 'tube_inside': 40, 'tubes': (200, 90, 150), 'tube_glass': 236,
    'bubbles': 240, 'notes': 255,
    'glass_w': 6, 'tube_w': 4,
}
if light:
    TONES.update({
        'wall': (255, 240),
        'bench': (170, 170),
        'bench_edge': 30,
        'glass': 28, 'shine': 170, 'inside': 250,
        'stand': 40,
        'flask_liquid': 85, 'meniscus': 40, 'bubble_in': 250,
        'burner': 40, 'flame': 85, 'flame_core': 255,
        'cone_inside': 250, 'cone_liquid': 170, 'cone_meniscus': 40,
        'rack': 40, 'tube_inside': 250, 'tubes': (85, 170, 40), 'tube_glass': 28,
        'bubbles': 30, 'notes': 85,
        # Thicker ink lines, so they stay ink (not blue) when the picture is shrunk.
        'glass_w': 10, 'tube_w': 6,
    })

def grey(v):
    return QColor(v, v, v)

img = QImage(W, H, QImage.Format.Format_RGB32)
p = QPainter(img)
p.setRenderHint(QPainter.RenderHint.Antialiasing)

# Back wall, brightest behind the glassware.
bg = QRadialGradient(QPointF(210, 200), 300)
bg.setColorAt(0, grey(TONES['wall'][0]))
bg.setColorAt(1, grey(TONES['wall'][1]))
p.fillRect(0, 0, W, H, QBrush(bg))

# Bench top.
bench = QLinearGradient(0, 360, 0, H)
bench.setColorAt(0, grey(TONES['bench'][0]))
bench.setColorAt(1, grey(TONES['bench'][1]))
p.fillRect(QRectF(0, 360, W, H - 360), QBrush(bench))
p.fillRect(QRectF(0, 358, W, 5), grey(TONES['bench_edge']))

no_pen = QPen(Qt.PenStyle.NoPen)
glass = QPen(grey(TONES['glass']), TONES['glass_w'])
shine = QPen(grey(TONES['shine']), 5, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap)

# Ring stand: base, rod, clamp arm.
p.setPen(no_pen)
p.setBrush(grey(TONES['stand']))
p.drawRect(QRectF(34, 346, 120, 13))
p.drawRect(QRectF(62, 96, 9, 252))
p.drawRect(QRectF(62, 124, 124, 7))

# Round-bottom flask with liquid.
flask = QPainterPath()
flask.addEllipse(QPointF(190, 215), 68, 68)
neck = QPainterPath()
neck.addRect(QRectF(176, 108, 28, 60))
flask = flask.united(neck)
p.setBrush(grey(TONES['inside']))
p.drawPath(flask)
p.save()
p.setClipPath(flask)
p.fillRect(QRectF(0, 206, W, 200), grey(TONES['flask_liquid']))
p.fillRect(QRectF(0, 204, W, 5), grey(TONES['meniscus']))
for x, y, r in [(170, 250, 7), (205, 236, 5), (188, 268, 4), (214, 262, 6)]:
    p.setBrush(grey(TONES['bubble_in']))
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
p.setBrush(grey(TONES['burner']))
p.drawRect(QRectF(172, 334, 36, 26))
p.drawRect(QRectF(164, 352, 52, 8))
outer = QPainterPath()
outer.moveTo(190, 288)
outer.cubicTo(206, 306, 206, 326, 190, 332)
outer.cubicTo(174, 326, 174, 306, 190, 288)
p.setBrush(grey(TONES['flame']))
p.drawPath(outer)
inner = QPainterPath()
inner.moveTo(190, 304)
inner.cubicTo(198, 314, 198, 326, 190, 330)
inner.cubicTo(182, 326, 182, 314, 190, 304)
p.setBrush(grey(TONES['flame_core']))
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
p.setBrush(grey(TONES['cone_inside']))
p.drawPath(cone)
p.save()
p.setClipPath(cone)
p.fillRect(QRectF(0, 304, W, 60), grey(TONES['cone_liquid']))
p.fillRect(QRectF(0, 302, W, 4), grey(TONES['cone_meniscus']))
p.restore()
p.setBrush(Qt.BrushStyle.NoBrush)
p.setPen(glass)
p.drawPath(cone)
p.drawRect(QRectF(282, 203, 36, 8))
p.setPen(shine)
p.drawLine(QPointF(279, 320), QPointF(295, 262))

# Test tubes in a rack.
p.setPen(no_pen)
p.setBrush(grey(TONES['rack']))
p.drawRect(QRectF(354, 292, 60, 7))
p.drawRect(QRectF(356, 299, 5, 60))
p.drawRect(QRectF(405, 299, 5, 60))
for x, level, shade in zip((361, 380, 399), (300, 318, 286), TONES['tubes']):
    tube = QPainterPath()
    tube.addRoundedRect(QRectF(x, 240, 12, 104), 6, 6)
    p.setPen(no_pen)
    p.setBrush(grey(TONES['tube_inside']))
    p.drawPath(tube)
    p.save()
    p.setClipPath(tube)
    p.fillRect(QRectF(x - 2, level, 18, 120), grey(shade))
    p.restore()
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.setPen(QPen(grey(TONES['tube_glass']), TONES['tube_w']))
    p.drawPath(tube)

# Bubbles rising out of the flask...
p.setPen(QPen(grey(TONES['bubbles']), 4 if light else 3))
for x, y, r in [(196, 88, 6), (184, 66, 4.5), (201, 46, 5)]:
    p.drawEllipse(QPointF(x, y), r, r)

# ...turning into music notes.
def eighth_note(x, y, s):
    p.save()
    p.translate(x, y)
    p.scale(s, s)
    p.setPen(no_pen)
    p.setBrush(grey(TONES['notes']))
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
print(f"{out}: {W}x{H} ({'light' if light else 'dark'})")
