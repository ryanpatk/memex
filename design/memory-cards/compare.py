# Side-by-side before/after images: python3 compare.py d01 d06 ...  -> compare/<id>.png
# Before comes from png-before/, after from png/. Needs Pillow.
import os, sys
from PIL import Image, ImageDraw, ImageFont
here = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(here, 'compare'), exist_ok=True)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 28)
except OSError:
    font = ImageFont.load_default()
for i in sys.argv[1:]:
    a = Image.open(os.path.join(here, 'png-before', i + '.png')).convert('RGB')
    b = Image.open(os.path.join(here, 'png', i + '.png')).convert('RGB')
    w = 960 if a.width > 1000 else 700
    a = a.resize((w, int(a.height * w / a.width))); b = b.resize((w, int(b.height * w / b.width)))
    pad, head = 24, 56
    out = Image.new('RGB', (w * 2 + pad * 3, max(a.height, b.height) + head + pad), (255, 255, 255))
    d = ImageDraw.Draw(out)
    d.text((pad, 14), f'{i} · before', fill=(98, 103, 110), font=font)
    d.text((pad * 2 + w, 14), f'{i} · after', fill=(29, 33, 39), font=font)
    out.paste(a, (pad, head)); out.paste(b, (pad * 2 + w, head))
    out.save(os.path.join(here, 'compare', i + '.png'), optimize=True)
    print('compare/' + i + '.png')
