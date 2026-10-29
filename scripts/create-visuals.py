"""Original code-drawn SVG artwork. No reference graphics or external assets."""
from pathlib import Path
import math
OUT=Path(__file__).resolve().parents[1]/'static/images/ctf'
HEAD='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" fill="none"><defs><radialGradient id="halo"><stop stop-color="#dc2626" stop-opacity=".45"/><stop offset="1" stop-color="#dc2626" stop-opacity="0"/></radialGradient><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#62616a"/><stop offset=".3" stop-color="#1c1c23"/><stop offset=".65" stop-color="#070709"/><stop offset="1" stop-color="#7f1d1d"/></linearGradient><linearGradient id="edge"><stop stop-color="#fca5a5"/><stop offset=".4" stop-color="#ef4444"/><stop offset="1" stop-color="#450a0a"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="5"/></filter></defs>'''
s=[HEAD,'<circle cx="300" cy="300" r="290" fill="url(#halo)"/>']
s+=['<g transform="translate(300 300) rotate(-28)"><ellipse rx="265" ry="94" stroke="#dc2626" stroke-width="1"/><ellipse rx="250" ry="88" stroke="#7f1d1d" stroke-dasharray="3 12"/></g>']
# Faceted, projected cryptographic polyhedron; consistent fallback for the live scene.
points=[]
for ring in range(7):
 lat=-math.pi/2+ring*math.pi/6
 points.append([(300+178*math.cos(lat)*math.cos(j*math.pi/6+.2),300+178*math.sin(lat)*.88+45*math.cos(lat)*math.sin(j*math.pi/6+.2)) for j in range(12)])
for r in range(6):
 for j in range(12):
  for tri in [(points[r][j],points[r+1][j],points[r+1][(j+1)%12]),(points[r][j],points[r][(j+1)%12],points[r+1][(j+1)%12])]:
   coords=' '.join(f'{x:.1f},{y:.1f}' for x,y in tri)
   s.append(f'<polygon points="{coords}" fill="url(#metal)" stroke="url(#edge)" stroke-opacity=".55" stroke-width=".8"/>')
s+=['<circle cx="300" cy="300" r="55" fill="#ef4444" opacity=".25" filter="url(#glow)"/>','<path d="m300 250 43 25v50l-43 25-43-25v-50z" fill="#16090c" stroke="#ef4444" stroke-width="2"/><path d="m300 265 30 18v34l-30 18-30-18v-34zM300 265v70m-30-52 30 17 30-17" stroke="#fca5a5" stroke-opacity=".7"/>','<g transform="translate(300 300) rotate(35)"><ellipse rx="224" ry="258" stroke="#ef4444" stroke-opacity=".3" stroke-dasharray="1 12"/><ellipse rx="225" ry="260" stroke="#7f1d1d" stroke-opacity=".5"/></g>']
for x,y in [(65,180),(514,413),(404,88),(164,493)]:s.append(f'<circle cx="{x}" cy="{y}" r="4" fill="#ef4444"/><circle cx="{x}" cy="{y}" r="11" stroke="#7f1d1d"/>')
s.append('</svg>');(OUT/'cipher-core.svg').write_text(''.join(s))
# Seven graphic families, used by category tiles and writeup cards.
for kind in ['cryptography','reverse-engineering','digital-forensics','binary-exploitation','web-exploitation','osint','miscellaneous']:
 s=[HEAD,'<circle cx="300" cy="300" r="260" fill="url(#halo)"/>']
 if kind=='cryptography':
  for i in range(6):
   pts=' '.join(f'{300+170*math.cos(j*math.pi/3):.1f},{300+170*math.sin(j*math.pi/3):.1f}' for j in range(6))
   s.append(f'<polygon points="{pts}" transform="rotate({i*12} 300 300)" fill="url(#metal)" fill-opacity=".2" stroke="url(#edge)" stroke-width="2"/>')
 elif kind=='reverse-engineering':
  for y in [240,285,330]:s.append(f'<path d="m300 {y-100} 150 85-150 85-150-85z" fill="url(#metal)" stroke="url(#edge)" stroke-width="3"/>')
  for i in range(7):
   x=175+i*35;s.append(f'<path d="M{x} 330v75m0-215v-45" stroke="#ef4444" stroke-width="3"/>')
 elif kind=='digital-forensics':
  for i in range(5):s.append(f'<path d="M130 {205+i*42}h{45+i*8}l20 -25 30 50 25 -50 30 25h{140-i*15}" stroke="url(#edge)" stroke-width="3"/>')
  s.append('<circle cx="325" cy="285" r="108" stroke="#a1a1aa" stroke-width="12"/><path d="m405 365 68 68" stroke="#ef4444" stroke-width="16"/>')
 elif kind=='binary-exploitation':
  for i in range(5):
   y=160+i*58;s.append(f'<path d="M150 {y}h300v44H150z" fill="url(#metal)" stroke="url(#edge)"/><path d="M175 {y+22}h60m40 0h35m35 0h75" stroke="#ef4444" stroke-width="3"/>')
  s.append('<path d="M475 190v210l-18-18m18 18 18-18" stroke="#fca5a5" stroke-width="3"/>')
 elif kind in ['web-exploitation','osint']:
  nodes=[(300,300),(160,170),(430,170),(120,350),(460,380),(290,460),(300,100)]
  for i,(x,y) in enumerate(nodes[1:]):s.append(f'<path d="M300 300 {x} {y}" stroke="#7f1d1d" stroke-width="3"/>')
  for x,y in nodes:s.append(f'<rect x="{x-26}" y="{y-26}" width="52" height="52" rx="{26 if kind=="osint" else 7}" fill="url(#metal)" stroke="url(#edge)" stroke-width="3"/><circle cx="{x}" cy="{y}" r="5" fill="#ef4444"/>')
 else:
  for x,y in [(220,220),(300,175),(380,220),(220,310),(300,355),(380,310)]:s.append(f'<path d="m{x} {y-50} 48 28v55l-48 28-48-28v-55z" fill="url(#metal)" stroke="url(#edge)" stroke-width="3"/>')
 s.append('</svg>');(OUT/(kind+'.svg')).write_text(''.join(s))
print('Created eight original SVG assets')
