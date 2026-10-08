# Draws the loading screen's eighth-note sprite: the notes that float out of the flask are
# animated by the page, so they are a separate little PNG with transparency, in the light
# palette's blue, the same shape as the notes placeholder-lab.py used to draw into the scene.
# Drawn at 4x like the scene, shrunk, then kept as solid pixels (no dithering).
# Runs under Calibre's bundled Python/Qt:
#   "C:\Program Files\Calibre2\calibre-debug.exe" -e tools\note-sprite.py -- src\note.png
import sys
from qt.core import QImage, QPainter, QColor, QPen, QPainterPath, QPointF, QRectF, Qt

out = [a for a in sys.argv if not a.startswith('--')][-1]
S = 4
W, H = 44, 56  # the sprite is W/S x H/S pixels
BLUE = QColor(0x2B, 0x6C, 0xB0)

img = QImage(W, H, QImage.Format.Format_ARGB32)
img.fill(Qt.GlobalColor.transparent)
p = QPainter(img)
p.setRenderHint(QPainter.RenderHint.Antialiasing)
p.setPen(QPen(Qt.PenStyle.NoPen))
p.setBrush(QColor(255, 255, 255))
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

small = img.scaled(W // S, H // S, Qt.AspectRatioMode.IgnoreAspectRatio, Qt.TransformationMode.SmoothTransformation)
sprite = QImage(small.size(), QImage.Format.Format_ARGB32)
sprite.fill(Qt.GlobalColor.transparent)
for y in range(small.height()):
    for x in range(small.width()):
        if small.pixelColor(x, y).alpha() >= 100:
            sprite.setPixelColor(x, y, BLUE)
sprite.save(out)
print(f"{out}: {sprite.width()}x{sprite.height()}")
