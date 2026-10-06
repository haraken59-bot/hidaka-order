"""Generate approved icons without changing the source artwork."""
import base64
import math
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / 'icons'

def render(source, size, maskable=False, opaque=False):
    canvas = Image.new('RGBA', (size, size), '#102512' if maskable or opaque else (0, 0, 0, 0))
    scale = size / max(source.size)
    if maskable:
        alpha = source.getchannel('A')
        radius = max(math.hypot(x + .5 - source.width / 2, y + .5 - source.height / 2)
                     for y in range(source.height) for x in range(source.width) if alpha.getpixel((x, y)))
        scale = min(scale, size * .38 / (radius + 4))
    dimensions = tuple(max(1, math.floor(d * scale)) for d in source.size)
    resized = source.resize(dimensions, Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized, ((size - dimensions[0]) // 2, (size - dimensions[1]) // 2))
    return canvas

if __name__ == '__main__':
    source = Image.open(ICON_DIR / 'source.png').convert('RGBA')
    for size in (16, 32, 48, 192, 512):
        render(source, size).save(ICON_DIR / f'icon-v2-{size}.png', optimize=True)
    for size in (192, 512):
        render(source, size, maskable=True).save(ICON_DIR / f'icon-v2-maskable-{size}.png', optimize=True)
        render(source, size).save(ICON_DIR / f'icon-{size}.png', optimize=True)
    render(source, 180, opaque=True).save(ICON_DIR / 'apple-touch-icon-v2.png', optimize=True)
    render(source, 48).save(ICON_DIR / 'favicon-v2.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    encoded = base64.b64encode((ICON_DIR / 'icon-v2-512.png').read_bytes()).decode('ascii')
    (ICON_DIR / 'icon.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,{encoded}"/></svg>\n', encoding='utf-8')
