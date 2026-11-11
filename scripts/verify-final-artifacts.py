"""Build review sheets/crops and measure text contrast in actual Firefox captures."""
import json
import math
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops, ImageStat

ROOT = Path('screenshots/final-review')
DOCS = Path('docs/final-review')
IDS = ['main', 'approach', 'experience', 'demo', 'common-ground', 'afterglow']
report = json.loads((DOCS / 'browser-results.json').read_text())
supplement = json.loads((DOCS / 'supplement-results.json').read_text())
artifacts = []
for page in report['fullPages']:
    full = Image.open(page['path']).convert('RGB')
    w = page['width']
    for index, section in enumerate(page['sections'][1:]):
        top = math.floor(section['y'])
        bottom = math.ceil(section['y'] + section['height'])
        path = ROOT / f'chapter-{w}-{IDS[index]}.png'
        full.crop((0, top, full.width, min(full.height, bottom))).save(path)
        artifacts.append(str(path))
    preview = full.copy()
    preview.thumbnail((480, 3600))
    path = ROOT / f'full-{w}-preview.png'
    preview.save(path)
    artifacts.append(str(path))
for w in [1440, 1280, 768, 390, 360]:
    cellw, cellh = (260, 620) if w < 600 else (480, 330)
    sheet = Image.new('RGB', (cellw * 3, cellh * 2), '#161622')
    draw = ImageDraw.Draw(sheet)
    for i, section in enumerate(IDS):
        image = Image.open(ROOT / f'{w}-{section}.png').convert('RGB')
        image.thumbnail((cellw, cellh - 25))
        x, y = (i % 3) * cellw, (i // 3) * cellh
        sheet.paste(image, (x, y + 20))
        draw.text((x + 5, y + 3), section, fill='white')
    path = ROOT / f'overview-{w}.jpg'
    sheet.save(path, quality=92)
    artifacts.append(str(path))
    # Scene sheets keep the live 3D render at a readable size.
    cellw, cellh = (260, 600) if w < 600 else (480, 330)
    sheet = Image.new('RGB', (cellw * 3, cellh * 2), '#161622')
    draw = ImageDraw.Draw(sheet)
    for i, section in enumerate(IDS):
        suffix = '' if section == 'main' else '-scene'
        image = Image.open(ROOT / f'{w}-{section}{suffix}.png').convert('RGB')
        image.thumbnail((cellw, cellh - 25))
        x, y = (i % 3) * cellw, (i // 3) * cellh
        sheet.paste(image, (x, y + 20))
        draw.text((x + 5, y + 3), section, fill='white')
    path = ROOT / f'scenes-{w}.jpg'
    sheet.save(path, quality=92)
    artifacts.append(str(path))

def luminance(rgb):
    c = [v / 255 for v in rgb]
    c = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in c]
    return sum(v * k for v, k in zip(c, [.2126, .7152, .0722]))

def ratio(a, b):
    low, high = sorted([luminance(a), luminance(b)])
    return (high + .05) / (low + .05)

checks = []
for frame in supplement['textSamples']:
    a = Image.open('screenshots/' + frame['stem'] + '.png').convert('RGB')
    b = Image.open('screenshots/' + frame['stem'] + '-background.png').convert('RGB')
    for sample in frame['samples']:
        fg = tuple(map(int, re.findall(r'\d+', sample['fg'])[:3]))
        x, y, width, height = sample['rect']
        values = []
        for py in range(max(0, math.floor(y)), min(a.height, math.ceil(y + height))):
            for px in range(max(0, math.floor(x)), min(a.width, math.ceil(x + width))):
                pixel, background = a.getpixel((px, py)), b.getpixel((px, py))
                if max(abs(pixel[i] - background[i]) for i in range(3)) > 40:
                    values.append(ratio(fg, background))
        if values:
            checks.append({'frame': frame['stem'], 'text': sample['text'], 'minimum': min(values),
                           'threshold': sample['threshold'], 'passed': min(values) >= sample['threshold']})
contrast = {'method': 'WCAG sRGB contrast under changed glyph pixels in paired actual Firefox screenshots; text hidden only for background capture.',
            'checks': checks, 'passed': bool(checks) and all(c['passed'] for c in checks),
            'minimum': min(c['minimum'] for c in checks),
            'limitations': 'Visible default text at chapter entrances at 1440 and 390; not every control state, animation frame, or a full WCAG audit.'}
(DOCS / 'contrast-results.json').write_text(json.dumps(contrast, indent=2) + '\n')
# Compare sticky Chamber frames at identical screen coordinates.
a = Image.open(ROOT / 'chamber-scroll-start.png').convert('RGB').crop((0, 0, 1440, 760))
b = Image.open(ROOT / 'chamber-scroll-end.png').convert('RGB').crop((0, 0, 1440, 760))
mae = sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3
(DOCS / 'motion-results.json').write_text(json.dumps({'chamber_scroll_mean_absolute_rgb_difference': mae,
    'changed': mae > 1, 'meaning': 'Different rendered sticky Chamber states; not an FPS measurement.'}, indent=2) + '\n')
paths = sorted(set(report['screenshots'] + supplement['screenshots'] + artifacts))
for path in paths:
    assert Path(path).is_file(), path
    with Image.open(path) as im:
        im.verify()
(DOCS / 'screenshot-manifest.json').write_text(json.dumps({'count': len(paths), 'files': paths}, indent=2) + '\n')
print(f'{len(paths)} valid images; {len(checks)} contrast samples, minimum {contrast["minimum"]:.2f}:1; Chamber difference {mae:.2f}')
assert contrast['passed'], 'Contrast checks failed'
assert mae > 1, 'Chamber scroll frames did not change'
