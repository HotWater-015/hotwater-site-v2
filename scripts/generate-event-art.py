#!/usr/bin/env python3
"""Original low-cost SVG sculptures for CTF tiles; no photos or external assets."""
from pathlib import Path
from math import sin,cos,pi
root=Path(__file__).resolve().parents[1]/'static/images/events'
def svg(name,body):
 defs='''<defs><radialGradient id="a"><stop stop-color="#8e1325" stop-opacity=".45"/><stop offset="1" stop-color="#08080b" stop-opacity="0"/></radialGradient><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4a424c"/><stop offset=".25" stop-color="#1f1b23"/><stop offset=".58" stop-color="#0b0b0f"/><stop offset="1" stop-color="#3b111c"/></linearGradient><linearGradient id="edge"><stop stop-color="#771422"/><stop offset=".52" stop-color="#fa4656"/><stop offset="1" stop-color="#2b0e16"/></linearGradient><radialGradient id="orb" cx=".85" cy=".2" r=".8"><stop stop-color="#63202c"/><stop offset=".3" stop-color="#1b1018"/><stop offset=".7" stop-color="#08080c"/><stop offset="1" stop-color="#050507"/></radialGradient></defs>'''
 root.joinpath(name+'.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" fill="none">{defs}<ellipse cx="410" cy="180" rx="230" ry="180" fill="url(#a)"/>{body}</svg>\n')
svg('cryovault','''<path d="M234 310 327 64 387 307Z" fill="url(#metal)"/><path d="m327 64 7 170 53 73Z" fill="#100d15"/><path d="m234 310 100-76-7-170" stroke="#79616b" stroke-opacity=".3"/><path d="m334 234 53 73-29-144Z" fill="#471321"/><path d="M346 310 435 147 507 316Z" fill="url(#metal)"/><path d="m435 147-16 111 88 58Z" fill="#0a090d"/><path d="M406 315 549 94 521 319Z" fill="url(#metal)"/><path d="m549 94-75 179 47 46Z" fill="#151017"/><path d="m327 64 30 97m78-14-16 111m130-164-52 81" stroke="url(#edge)" stroke-width="2"/><path d="m210 320 83-19 56 21 44-14 66 16 98-11" stroke="#651825" stroke-opacity=".6"/>''')
orb='<circle cx="418" cy="210" r="137" fill="url(#orb)"/><path d="M331 104a137 137 0 0 1 210 113" stroke="url(#edge)" stroke-width="2.5"/>'
craters=''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#160e14" fill-opacity=".4" stroke="#63303b" stroke-opacity=".14"/>' for x,y,r in [(460,120,16),(503,171,24),(475,220,12),(510,245,18),(437,161,7),(462,290,25),(405,105,5)])
svg('eclipse',orb+craters+'<path d="m230 318 320-200" stroke="#5d1827" stroke-opacity=".15"/>')
svg('monolith','''<path d="M289 306V145L423 41l134 104v161L423 352Z" fill="url(#metal)"/><path d="M423 41v311l134-46V145Z" fill="#0c0b10"/><path d="M423 41v311" stroke="url(#edge)" stroke-width="3"/><path d="m289 145 134 81 134-81m-268 52 134 78 134-78m-268 52 134 78 134-78M337 108v218m41-250v264m91-263v259m44-225v213" stroke="#68616e" stroke-opacity=".16"/><path d="m427 89 0 106m0 42v53" stroke="#ef4444" stroke-width="1"/>''')
svg('fracture','''<path d="m278 54 117 109L512 54l-79 142 79 123-117-91-117 91 76-123Z" fill="url(#metal)"/><path d="m278 54 103 144-103 121 117-91 117 91-103-121L512 54 395 163Z" fill="#170d14"/><path d="m278 54 103 144-103 121m234-265L409 198l103 121" stroke="url(#edge)" stroke-width="2"/><path d="m299 92 83 78m27 0 81-78M310 283l73-61m26 0 76 59" stroke="#60323f" stroke-opacity=".35"/>''')
rings=''
for i in range(11):
 r=100-i*5
 rings+=f'<ellipse cx="415" cy="190" rx="{r+26}" ry="{r*.64}" transform="rotate(-35 415 190)" stroke="{["#33232e","#16131c","#531724","#9d2333"][i%4]}" stroke-width="{4 if i%3==0 else 2}" stroke-dasharray="{150+i*8} 22 50 19"/>'
svg('cipher',rings+'<ellipse cx="415" cy="190" rx="35" ry="23" transform="rotate(-35 415 190)" fill="#07070a"/><path d="M323 274 305 295m201-203 19-22" stroke="#ef4444" stroke-opacity=".6"/>')
svg('fold','''<path d="m258 80 149 84 136-92-64 123 64 118-139-75-146 75 73-118Z" fill="url(#metal)"/><path d="m258 80 149 84-3 74-146 75 103-117Z" fill="#121017"/><path d="m543 72-64 123 64 118-139-75 3-74Z" fill="#1c111a"/><path d="m407 164 72 31-75 43m3-74L543 72m-139 166 139 75" stroke="url(#edge)"/><path d="m407 164-3 74m75-43L258 80m146 158L258 313" stroke="#77636c" stroke-opacity=".22"/>''')
svg('horizon',orb+'''<path d="m200 306 53-34 31 13 39-51 27 32 32-17 42 29 32-10 52 36 63-13 29 35H200Z" fill="url(#metal)"/><path d="m200 306 53-34 31 13 39-51 27 32 32-17 42 29 32-10 52 36 63-13" stroke="#572333" stroke-opacity=".7"/>''')
print('Generated 7 original event sculptures.')
