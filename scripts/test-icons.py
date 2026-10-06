import json
import re
import math
from pathlib import Path
from PIL import Image, ImageChops
from generate_icons import render
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.webmanifest').read_text(encoding='utf-8'))
source = Image.open(root / 'icons/source.png').convert('RGBA')
for entry in manifest['icons']:
    path = root / entry['src']
    icon = Image.open(path).convert('RGBA')
    size = int(entry['sizes'].split('x')[0])
    assert icon.size == (size,size)
    if entry['purpose'] == 'maskable':
        assert icon.getchannel('A').getextrema() == (255,255)
        delta = ImageChops.difference(icon.convert('RGB'), Image.new('RGB',icon.size,'#102512'))
        for y in range(size):
            for x in range(size):
                if any(delta.getpixel((x,y))):
                    assert math.hypot(x+.5-size/2,y+.5-size/2) <= size*.4
    else:
        assert icon.getchannel('A').getextrema() == (0,255)
        assert ImageChops.difference(icon,render(source,size)).getbbox() is None
    assert entry['src'] in (root / 'scripts/build-pages.mjs').read_text(encoding='utf-8')
    assert './'+entry['src'] in (root / 'service-worker.js').read_text(encoding='utf-8')
html = (root / 'index.html').read_text(encoding='utf-8')
for path in re.findall(r'href="(icons/[^"]+)"',html):
    assert (root/path).is_file()
assert Image.open(root/'icons/apple-touch-icon-v2.png').size == (180,180)
assert Image.open(root/'icons/favicon-v2.ico').ico.sizes() == {(16,16),(32,32),(48,48)}
assert manifest['id'] == './' and manifest['start_url'] == './' and manifest['scope'] == './'
print('Icon dimensions, transparency, safe circle, references, ICO and PWA identity passed')
