"""Convert real exportStudy renders into the existing three responsive WebP sizes."""
from pathlib import Path
from PIL import Image

for name in ['trace', 'chamber', 'perspective', 'common', 'afterglow', 'within', 'above']:
    with Image.open(Path('docs/visual-polish/poster-renders') / f'{name}.png') as image:
        for width in [1440, 1000, 600]:
            suffix = '' if width == 1440 else f'-{width}'
            image.resize((width, round(width * image.height / image.width)), Image.Resampling.LANCZOS).save(
                Path('public/exhibition') / f'{name}{suffix}.webp', quality=90, method=3)
print('21 responsive fallback posters updated from actual scene exports')
