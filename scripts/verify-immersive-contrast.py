"""Measure text against captured, text-hidden Firefox backgrounds (Pillow only)."""
import json
import math
import re
from pathlib import Path
from PIL import Image


def luminance(rgb):
    channels = [v / 255 for v in rgb]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in channels]
    return sum(v * weight for v, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


def ratio(fg, bg):
    a, b = sorted((luminance(fg), luminance(bg)))
    return (b + 0.05) / (a + 0.05)


samples = json.loads(Path('docs/immersive-v2/contrast-samples.json').read_text())
results = []
for viewport in samples:
    screenshot = Image.open(viewport['screenshot']).convert('RGB')
    foreground = Image.open(viewport['foregroundScreenshot']).convert('RGB')
    for sample in viewport['samples']:
        fg = tuple(map(int, re.findall(r'[\d.]+', sample['color'])[:3]))
        pixels = set()
        for rect in sample['rects']:
            box = (max(0, math.floor(rect['x'])), max(0, math.floor(rect['y'])),
                   min(screenshot.width, math.ceil(rect['x'] + rect['w'])),
                   min(screenshot.height, math.ceil(rect['y'] + rect['h'])))
            if box[2] > box[0] and box[3] > box[1]:
                for py in range(box[1], box[3]):
                    for px in range(box[0], box[2]):
                        bg = screenshot.getpixel((px, py))
                        actual = foreground.getpixel((px, py))
                        # Difference mask follows painted glyphs, excluding empty
                        # font ascender/descender space in DOM range rectangles.
                        if sum(abs(a - b) for a, b in zip(bg, actual)) >= 8:
                            pixels.add(bg)
        if not pixels:
            continue
        bg = min(pixels, key=lambda color: ratio(fg, color))
        measured = ratio(fg, bg)
        size = float(sample['fontSize'].removesuffix('px'))
        threshold = 3 if size >= 24 or (size >= 18.67 and int(sample['fontWeight']) >= 700) else 4.5
        results.append({'viewport': viewport['label'], 'selector': sample['selector'],
                        'foreground': fg, 'worstSampledBackground': bg,
                        'ratio': measured, 'threshold': threshold, 'passed': measured >= threshold})

for name, fg, bg in [
    ('CTA default', '#201431', '#e7ddff'), ('CTA hover', '#201431', '#f4efff'),
    ('CTA pressed', '#201431', '#d0c0f2'), ('Keyboard focus / canvas', '#95edee', '#080910'),
    ('Keyboard focus / menu', '#95edee', '#171422'), ('Control border / canvas', '#b9b4ca', '#080910'),
    ('Mobile menu text', '#f5f1fa', '#171422'),
]:
    rgb = lambda color: tuple(bytes.fromhex(color.removeprefix('#')))
    measured = ratio(rgb(fg), rgb(bg))
    threshold = 3 if name.startswith(('Keyboard', 'Control')) else 4.5
    results.append({'pair': name, 'foreground': fg, 'background': bg, 'ratio': measured,
                    'threshold': threshold, 'passed': measured >= threshold})

report = {'method': 'WCAG sRGB luminance; background pixels under painted glyphs (difference mask) within text ranges from actual Firefox text-hidden screenshots. Control states use opaque CSS pairs.',
          'limitations': 'Sampled default desktop/mobile scene and opaque control states; not a full accessibility audit or every animated frame.',
          'checks': results, 'passed': all(r['passed'] for r in results)}
Path('docs/immersive-v2/contrast-results.json').write_text(json.dumps(report, indent=2) + '\n')
print(f"Contrast: {sum(r['passed'] for r in results)}/{len(results)} passed; minimum {min(r['ratio'] for r in results):.2f}:1")
assert report['passed'], [r for r in results if not r['passed']]
