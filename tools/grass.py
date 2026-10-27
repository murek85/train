#!/usr/bin/env python3
"""Atlas kęp trawy (js/3d/world.js – trawa z kart, WebGPU) z zestawów ambientCG (CC0, *_1K-PNG.zip):
Foliage001 (pojedyncze źdźbła), Foliage003 (trawy z kłosami, chwasty), Foliage008 (długie źdźbła trawnikowe).

Użycie:
  python tools/grass.py <folder z zipami> [--size 512]

Pola atlasu (4 × 1, nasada kępy na dole pola, środek): 0 niska gęsta kępa, 1 wysoka kępa, 2 kępa z kłosami
(pobocza, nieużytki), 3 rzadka kępa z pojedynczymi długimi źdźbłami. Kolor jako jasność (barwę nadaje egzemplarz –
pora roku, sucha / świeża trawa), krycie w alfie. Wynik: textures/foliage/grass_color.webp.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from foliage import Cell, leaves, gray  # noqa: E402

from PIL import Image  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'textures', 'foliage')


def tuft(cell, L, rnd, n, hmin, hmax, spread, extra=None, ne=0):
    """kępa: n źdźbeł od nasady (środek dołu pola, rozrzut ±4% szerokości) w wachlarz ±spread stopni, dłuższe w środku"""
    S = cell.S
    jobs = []
    for i in range(n):
        a = rnd.uniform(-spread, spread)
        h = S * rnd.uniform(hmin, hmax) * (1 - 0.35 * abs(a) / max(1, spread))
        jobs.append((rnd.random(), rnd.choice(L), S / 2 + rnd.uniform(-0.04, 0.04) * S, a, h))
    for i in range(ne):
        a = rnd.uniform(-spread * 0.6, spread * 0.6)
        jobs.append((rnd.random(), rnd.choice(extra), S / 2 + rnd.uniform(-0.03, 0.03) * S, a, S * rnd.uniform(0.75, 0.95)))
    jobs.sort(key=lambda j: j[0])
    for depth, leaf, x, a, h in jobs:
        cell.paste(leaf, x, S - 2, h, a, shade=0.7 + 0.35 * depth, anchor=(0.5, 1.0))


def main():
    src = sys.argv[1]
    S = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 512
    p = lambda n: os.path.join(src, n + '_1K-PNG.zip')
    rnd = random.Random(11)
    blades = leaves(p('Foliage001'))
    # (cienkie łodygi z kłosami rozpadają się przy wycinaniu – tylko 4 najwyższe wycinki, całe rośliny)
    weeds = sorted(leaves(p('Foliage003')), key=lambda l: -l[0].height)[:4]
    longb = leaves(p('Foliage008'), rotate=90)  # nasada z lewej – na dół
    print('źdźbła', len(blades), 'kłosy', len(weeds), 'długie', len(longb))
    blades, weeds, longb = [[(gray(c, g), a, n) for c, a, n in L] for L, g in ((blades, 1.25), (weeds, 1.35), (longb, 1.2))]
    cells = []
    for k in range(4):
        cell = Cell(S)
        if k == 0:
            tuft(cell, blades + longb, rnd, 38, 0.35, 0.6, 38)
        elif k == 1:
            tuft(cell, blades + longb, rnd, 30, 0.6, 0.95, 26)
        elif k == 2:
            tuft(cell, blades, rnd, 22, 0.4, 0.7, 34, weeds, 3)
        else:
            tuft(cell, longb + blades, rnd, 14, 0.5, 0.9, 42)
        cells.append(cell)
    col = Image.new('RGBA', (4 * S, S))
    for k, cell in enumerate(cells):
        rgba = cell.c.copy()
        rgba.putalpha(cell.a)
        col.paste(rgba, (k * S, 0))
    os.makedirs(OUT, exist_ok=True)
    col.save(os.path.join(OUT, 'grass_color.webp'), quality=90, method=6, exact=True)
    print('zapisano grass_color.webp')


if __name__ == '__main__':
    main()
