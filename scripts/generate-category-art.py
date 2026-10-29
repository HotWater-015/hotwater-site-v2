#!/usr/bin/env python3
"""Original, deterministic Hotwater vector collection. No external artwork or runtime dependency."""
from pathlib import Path
from math import sin, cos, pi
ROOT=Path(__file__).resolve().parents[1]
def path(d,**attrs):
 return '<path d="'+d+'" '+ ' '.join(f'{k.replace("_","-")}="{v}"' for k,v in attrs.items())+'/>'
def circle(x,y,r,fill='#160b10'):
 return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'
def group(s,cls='art-detail'):
 return f'<g class="{cls}">{s}</g>'
def cube(x,y,s=18):
 return f'<path d="M{x} {y-s} {x+s} {y-s/2} {x+s} {y+s/2} {x} {y+s} {x-s} {y+s/2} {x-s} {y-s/2}Z" fill="#150b10"/><path d="m{x-s} {y-s/2} {s} {s/2} {s} {-s/2}M{x} {y}v{s}"/><path d="m{x-s} {y-s/2} {s} {-s/2} {s} {s/2} {-s} {s/2}Z" fill="#351017"/>'
art={}
pts=[(100+48*cos(i*pi/4),90+57*sin(i*pi/4)) for i in range(8)]
art['ai']=path('M100 33 134 50 148 90 134 130 100 147 66 130 52 90 66 50Z',stroke_opacity='.7')+''.join(path(f'M{x:.1f} {y:.1f} {pts[(i+2)%8][0]:.1f} {pts[(i+2)%8][1]:.1f}',stroke_opacity='.4') for i,(x,y) in enumerate(pts))+group(''.join(path(f'M{x:.1f} {y:.1f} 100 90 {pts[(i+3)%8][0]:.1f} {pts[(i+3)%8][1]:.1f}',stroke_opacity='.55') for i,(x,y) in enumerate(pts))+''.join(circle(round(x,1),round(y,1),3,'#ef4444') for x,y in pts)+circle(100,90,6,'#ef4444'),'art-nodes')
art['binary-exploitation']=''.join(group(f'<path d="M55 {40+i*25}h90v16H55Z" fill="#180c11"/>'+path(f'M62 {46+i*25}h22m9 0h9m15 0h20M63 {51+i*25}h59',stroke='#ef4444'), 'art-layer') for i in range(4))
art['boot2root']=''.join(group(path(f'M100 {35+i*29} 150 {61+i*29} 100 {87+i*29} 50 {61+i*29}Z',fill='#0c0c10'),'art-layer') for i in range(3))
art['cloud']=path('M57 104a24 24 0 1 1 2-48 36 36 0 0 1 70-4 26 26 0 1 1 15 52',fill='#130c11')+group(''.join(path(f'M{x} {y}v{143-y}')+circle(x,147,2.5) for x,y in [(75,93),(91,80),(108,95),(124,86)]),'art-signal')
art['cryptography']=group('<ellipse cx="92" cy="90" rx="39" ry="53" transform="rotate(-28 92 90)"/><ellipse cx="108" cy="90" rx="39" ry="53" transform="rotate(28 108 90)" stroke="#9b3640"/><circle cx="100" cy="90" r="58" stroke-dasharray="3 10" stroke-opacity=".4"/>','art-orbit')+path('M100 23v10m0 114v10M34 90h10m112 0h10',stroke_opacity='.6')
art['devsec']=path('M51 46h98v91H51Z',fill='#100c10')+path('M51 66h98M68 83l12 12-12 12m23 1h18')+''.join(circle(x,56,1.8,'#ef4444') for x in [61,69,77])+group(path('M62 123h75',stroke_opacity='.6'),'art-scan')
art['digital-forensics']=path('M42 65h13l7-12 10 27 8-16h12m-50 25h13l7-12 10 27 8-16h12m-50 25h13l7-12 10 27 8-16h12',stroke_opacity='.6')+group('<circle cx="111" cy="85" r="39" fill="#1b0b12" fill-opacity=".5" stroke="#e6a2a9" stroke-width="3"/>'+path('M139 113l28 28',stroke='#ef4444',stroke_width='7')+path('M82 77h12l7-13 10 29 9-17h20',stroke='#ef4444'),'art-scan')
art['hardware']=path('M65 56h70v70H65Z',fill='#170b10')+path('M85 76h30v30H85Z',fill='#390e1a')+group(''.join(path(f'M{x} 34v22m0 70v22M43 {x-9}h22m70 0h22') for x in [76,88,100,112,124]),'art-circuit')
art['iot']=cube(100,108,34)+group(path('M74 53q26-23 52 0M84 65q16-14 32 0M96 76q4-4 8 0',stroke_width='2'),'art-signal')+path('M100 142v12')
art['miscellaneous']=group(cube(80,65,22)+cube(134,91,18)+cube(66,119,14)+cube(111,132,23),'art-layer')
pts=[(100,37),(54,66),(146,66),(56,119),(144,119),(100,148),(100,91)]
art['ml']=group(''.join(path(f'M{a[0]} {a[1]} {b[0]} {b[1]}',stroke_opacity='.55') for i,a in enumerate(pts) for j,b in enumerate(pts) if j>i and (i==6 or j==6 or j==i+1))+''.join(circle(x,y,6,'#3a101b') for x,y in pts),'art-nodes')
art['mobile']=path('M82 36h38q9 0 9 9v92q0 9-9 9H82q-9 0-9-9V45q0-9 9-9Z',fill='#120b10')+path('M91 44h20M95 137h12')+group(path('M101 115V72h15M83 85h18M141 48v87m-80-70v60',stroke_opacity='.65'),'art-circuit')
art['networking']=group('<ellipse cx="100" cy="90" rx="52" ry="52"/><ellipse cx="100" cy="90" rx="25" ry="52"/>'+path('M48 90h104M57 64q43-16 86 0M57 116q43 16 86 0M100 38v104'),'art-orbit')+path('M29 90q71 47 142 0M29 90q71-47 142 0',stroke_opacity='.45')+circle(29,90,5,'#ef4444')+circle(171,90,5,'#ef4444')
art['osint']=path('M38 60V39h23m78 0h23v21M38 120v21h23m78 0h23v-21',stroke_opacity='.6')+path('M48 90q52-61 104 0-52 61-104 0Z',fill='#100b10')+group(circle(100,90,25)+circle(100,90,8,'#ef4444'),'art-scan')
art['reverse-engineering']=''.join(group(path(f'M100 {44+i*27} 148 {69+i*27} 100 {94+i*27} 52 {69+i*27}Z',fill='#110c11'),'art-layer') for i in range(3))+group(''.join(path(f'M{x} 35v15m0 81v15') for x in [70,85,100,115,130]),'art-circuit')
art['steganography']=path('M58 50h99v83H58Z',stroke_opacity='.35')+path('M45 61h99v83H45Z',fill='#150b10')+circle(74,84,6,'#ef4444')+path('m55 130 25-29 16 17 20-33 17 25')+group(''.join(path(f'M{x} {y}h9v9h-9Z',fill='#9f172b',stroke='none') for x,y in [(138,73),(149,84),(138,95),(149,117),(138,128)]),'art-scan')
art['web-exploitation']=path('M48 42h104v67H48Z',fill='#100b10')+path('M48 59h104')+''.join(circle(x,51,1.6,'#ef4444') for x in [57,65,73])+group(path('M76 76 65 85l11 9m48-18 11 9-11 9M105 72 95 99M100 110v23H64m36 0h36')+''.join(circle(x,140,6,'#36101a') for x in [64,100,136]),'art-nodes')
for name,shapes in art.items():
 grid=path('M40 30v120m30-120v120m30-120v120m30-120v120m30-120v120M30 40h140M30 70h140M30 100h140M30 130h140',stroke='#69232f',stroke_opacity='.15',stroke_width='.6')
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180" class="ctf-visual art-{name}" aria-hidden="true" focusable="false" fill="none" stroke="#e13b49" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">{grid}{shapes}</svg>\n'
 (ROOT/'static/images/categories'/f'{name}.svg').write_text(svg)
(ROOT/'data/category-visuals.yaml').write_text('# Canonical archive categories → original SVG assets. Unknown categories use puzzle geometry.\n'+''.join(f'{name}: {name}\n' for name in art))
print(f'Generated {len(art)} distinct category illustrations.')
