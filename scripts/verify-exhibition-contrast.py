"""Measure sampled backgrounds beneath changed glyph pixels in paired Firefox captures."""
import json,re,math
from pathlib import Path
from PIL import Image,ImageChops
report=json.loads(Path('docs/exhibition/details-results.json').read_text())
def luminance(rgb):
 c=[v/255 for v in rgb];c=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c]
 return sum(v*w for v,w in zip(c,[.2126,.7152,.0722]))
def ratio(a,b):
 x,y=sorted([luminance(a),luminance(b)]);return (y+.05)/(x+.05)
checks=[]
for frame in report['textSamples']:
 a=Image.open('screenshots/'+frame['stem']+'.png').convert('RGB');b=Image.open('screenshots/'+frame['stem']+'-background.png').convert('RGB')
 for sample in frame['samples']:
  fg=tuple(map(int,re.findall(r'\d+',sample['fg'])[:3]));x,y,w,h=sample['rect'];values=[]
  for py in range(max(0,math.floor(y)),min(a.height,math.ceil(y+h))):
   for px in range(max(0,math.floor(x)),min(a.width,math.ceil(x+w))):
    p=a.getpixel((px,py));bg=b.getpixel((px,py))
    if max(abs(p[i]-bg[i]) for i in range(3))>40:values.append(ratio(fg,bg))
  if values:checks.append({'frame':frame['stem'],'foreground':fg,'minimum':min(values),'threshold':sample['threshold'],'passed':min(values)>=sample['threshold']})
result={'method':'Paired real Firefox screenshots, text hidden, difference mask within text-node ranges; WCAG sRGB luminance','checks':checks,'passed':bool(checks) and all(c['passed'] for c in checks),'limitations':'Sampled default headings, body and chapter labels at desktop/mobile; not every animation frame or a full WCAG audit.'}
Path('docs/exhibition/contrast-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(len(checks),'samples; passed:',result['passed'],'minimum:',min(c['minimum'] for c in checks))
assert result['passed']
