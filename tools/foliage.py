#!/usr/bin/env python3
"""Atlas liści do drzew z modeli (js/3d/trees.js) z zestawów liści ambientCG (CC0, *_1K-PNG.zip).

Użycie:
  python tools/foliage.py <folder z zipami> [--size 512]

Z każdego zestawu (pojedyncze liście / gałązki na arkuszu: *_Color, *_Opacity, *_NormalGL) wycinane są osobne liście
(spójne obszary maski krycia), a z nich składane gałązki: patyk od dołu pola ku górze, liście naprzemiennie po obu
stronach i na końcu (nasada liścia przy patyku, obrót z normalnymi). Kolor zapisany jako jasność (barwę nadaje
egzemplarz drzewa – gatunek i pora roku, jak w dawnym atlasie z kodu), krycie w alfie.

Pola atlasu (4 × 2, nasada gałązki na dole pola, środek):
  0 dąb (LeafSet016 + kształty LeafSet012)   1 topola (LeafSet004)   2 brzoza, krzewy (LeafSet014)
  3 lipa / grab – większe liście (LeafSet014 + LeafSet004)
  4 świerk – gałązka (LeafSet019)   5 sosna – pęczki igieł (PineNeedles001)   6 gęste liście (bryły z daleka)
  7 nagie gałązki
Wynik: textures/foliage/foliage{,-winter}_{color,normal}.webp (zima: w polach liściastych nagie gałązki).
"""
import io
import math
import os
import random
import sys
import zipfile

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'textures', 'foliage')


def load_set(path):
    """(kolor RGB, krycie L, normalne RGB) z archiwum zestawu"""
    m = {}
    with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            low = n.lower()
            for k, suf in (('c', '_color.png'), ('a', '_opacity.png'), ('n', '_normalgl.png')):
                if low.endswith(suf):
                    m[k] = Image.open(io.BytesIO(z.read(n)))
    return m['c'].convert('RGB'), m['a'].convert('L'), m['n'].convert('RGB')


def blobs(alpha, min_area=40):
    """prostokąty spójnych obszarów krycia (wypełnianie na masce 256 × 256)"""
    S = 256
    small = alpha.resize((S, S), Image.BILINEAR)
    px = small.load()
    seen = bytearray(S * S)
    out = []
    for y0 in range(S):
        for x0 in range(S):
            if seen[y0 * S + x0] or px[x0, y0] < 60:
                continue
            stack = [(x0, y0)]
            seen[y0 * S + x0] = 1
            x1 = x2 = x0
            y1 = y2 = y0
            n = 0
            while stack:
                x, y = stack.pop()
                n += 1
                x1, x2, y1, y2 = min(x1, x), max(x2, x), min(y1, y), max(y2, y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    u, v = x + dx, y + dy
                    if 0 <= u < S and 0 <= v < S and not seen[v * S + u] and px[u, v] >= 60:
                        seen[v * S + u] = 1
                        stack.append((u, v))
            if n >= min_area:
                k = alpha.width / S
                out.append((int((x1 - 1) * k), int((y1 - 1) * k), int((x2 + 2) * k), int((y2 + 2) * k)))
    return out


def leaves(path, rotate=0):
    """pojedyncze liście: (kolor, krycie, normalne) – nasada na dole (rotate – obrót arkusza w stopniach, CCW)"""
    c, a, n = load_set(path)
    res = []
    for box in blobs(a):
        cc, aa, nn = c.crop(box), a.crop(box), n.crop(box)
        if rotate:
            cc, aa, nn = cc.rotate(rotate, expand=True), aa.rotate(rotate, expand=True), rot_normals(nn.rotate(rotate, expand=True), rotate)
        res.append((cc, aa, nn))
    return res


def rot_normals(img, deg):
    """obrót wektorów normalnych (xy) po obrocie obrazu o deg (CCW); tło poza obrazem – płaskie"""
    r = math.radians(deg)
    cs, sn = math.cos(r), math.sin(r)
    out = Image.new('RGB', img.size)
    src, dst = img.load(), out.load()
    for y in range(img.height):
        for x in range(img.width):
            R, G, B = src[x, y]
            if R == 0 and G == 0 and B == 0:
                dst[x, y] = (128, 128, 255)
                continue
            nx, ny = R / 127.5 - 1, G / 127.5 - 1
            # obraz: y w dół, mapa GL: y w górę – obrót CCW widoczny to ten sam kąt w układzie GL
            mx, my = nx * cs - ny * sn, nx * sn + ny * cs
            dst[x, y] = (int((mx + 1) * 127.5), int((my + 1) * 127.5), B)
    return out


def gray(c, gain):
    """jasność z kolorem lekko zachowanym (10%), średnio ok. 0,75"""
    r, g, b = c.split()
    L = c.convert('L')
    return Image.merge('RGB', [Image.blend(L, ch, 0.1) for ch in (r, g, b)]).point(lambda v: min(255, int(v * gain)))


class Cell:
    def __init__(self, S):
        self.S = S
        self.c = Image.new('RGB', (S, S), (90, 90, 90))
        self.a = Image.new('L', (S, S), 0)
        self.n = Image.new('RGB', (S, S), (128, 128, 255))

    def paste(self, leaf, cx, cy, h, ang, shade=1.0, anchor=(0.5, 1.0)):
        """liść o dłuższym boku h px z nasadą (anchor – ułamek szer. / wys. wycinka) w (cx, cy), obrót ang (st., CCW)"""
        c, a, n = leaf
        k = h / max(c.width, c.height)
        w2, h2 = max(1, int(c.width * k)), max(1, int(c.height * k))
        c, a, n = c.resize((w2, h2), Image.LANCZOS), a.resize((w2, h2), Image.LANCZOS), n.resize((w2, h2), Image.LANCZOS)
        if shade != 1.0:
            c = c.point(lambda v: min(255, int(v * shade)))
        # obrót wokół nasady: wycinek powiększony tak, by nasada była w środku
        ax, ay = anchor[0] * w2, anchor[1] * h2
        R = int(math.hypot(max(ax, w2 - ax), max(ay, h2 - ay))) + 2
        def centered(img, bg):
            big = Image.new(img.mode, (2 * R, 2 * R), bg)
            big.paste(img, (int(R - ax), int(R - ay)))
            return big
        bc, ba, bn = centered(c, (0, 0, 0)), centered(a, 0), centered(n, (128, 128, 255))
        if ang:
            bc = bc.rotate(ang, resample=Image.BICUBIC)
            ba = ba.rotate(ang, resample=Image.BICUBIC)
            bn = rot_normals(bn.rotate(ang, resample=Image.BICUBIC), ang)
        pos = (int(cx - R), int(cy - R))
        self.c.paste(bc, pos, ba)
        self.n.paste(bn, pos, ba)
        self.a.paste(Image.new('L', ba.size, 255), pos, ba)

    def twig(self, pts, w, v=70):
        d = ImageDraw.Draw(self.c)
        da = ImageDraw.Draw(self.a)
        for i in range(len(pts) - 1):
            ww = max(1, int(w * (1 - i / len(pts) * 0.7)))
            d.line([pts[i], pts[i + 1]], fill=(v, v - 4, v - 8), width=ww)
            da.line([pts[i], pts[i + 1]], fill=255, width=ww)


def spray(cell, L, rnd, n, size, gain=1.0):
    """gałązka w wachlarz: 3 patyki od nasady (środek dołu pola) pod różnymi kątami, na każdym n liści naprzemiennie
    i jeden na końcu; liście w głębi (rysowane wcześniej) ciemniejsze"""
    S = cell.S
    x0, y0 = S / 2, S - 4
    twigs = []
    for k, a0 in enumerate((-38, 0, 38)):
        a = math.radians(a0 + rnd.uniform(-8, 8))
        ln = S * (0.62 if a0 == 0 else 0.5) * rnd.uniform(0.9, 1.05)
        bend = rnd.uniform(-0.15, 0.15)
        pts = []
        for i in range(11):
            t = i / 10
            aa = a + bend * t
            pts.append((x0 + math.sin(aa) * ln * t, y0 - math.cos(aa) * ln * t))
        twigs.append((pts, math.degrees(a)))
    for pts, _ in twigs:
        cell.twig(pts, S * 0.012)
    jobs = []
    for pts, ad in twigs:
        for i in range(n):
            t = 0.25 + 0.7 * (i + rnd.random() * 0.5) / n
            q = pts[min(10, int(t * 10))]
            side = -1 if i % 2 else 1
            jobs.append((rnd.random(), q, -ad + side * rnd.uniform(40, 70), size * S * rnd.uniform(0.8, 1.1) * (1 - 0.2 * t)))
        jobs.append((1.0, pts[-1], -ad + rnd.uniform(-10, 10), size * S * 0.9))
    jobs.sort(key=lambda j: j[0])
    for depth, q, ang, h in jobs:
        cell.paste(rnd.choice(L), q[0], q[1], h, ang, shade=gain * (0.7 + 0.35 * depth))


def bare(cell, rnd):
    """nagie gałązki (zima): rozgałęzienia rekurencyjne"""
    S = cell.S
    def br(x, y, ang, ln, w, dep):
        x2, y2 = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        cell.twig([(x, y), (x2, y2)], w, 95)
        if dep <= 0:
            return
        for _ in range(2 + (rnd.random() < 0.4)):
            br(x2, y2, ang + rnd.uniform(-0.65, 0.65), ln * rnd.uniform(0.6, 0.78), w * 0.7, dep - 1)
    for _ in range(3):
        br(S / 2 + rnd.uniform(-20, 20), S - 4, -math.pi / 2 + rnd.uniform(-0.5, 0.5), S * 0.3, S * 0.02, 4)


def tufts(cell, L, rnd, n):
    """pęczki igieł sosny: kilka krótkich pędów od nasady, na końcu każdego igły promieniście"""
    S = cell.S
    x0, y0 = S / 2, S - 4
    for k in range(n):
        a = math.radians(-45 + 90 * k / max(1, n - 1) + rnd.uniform(-8, 8))
        ln = S * rnd.uniform(0.35, 0.5)
        ex, ey = x0 + math.sin(a) * ln, y0 - math.cos(a) * ln
        cell.twig([(x0, y0), (ex, ey)], S * 0.015)
        for j in range(14):
            ang = -math.degrees(a) + rnd.uniform(-75, 75)
            # (igły w arkuszu poziomo, nasada z lewej – obrót o 90° do kierunku pędu)
            cell.paste(rnd.choice(L), ex, ey, S * rnd.uniform(0.22, 0.32), ang + 90, shade=rnd.uniform(0.75, 1.1), anchor=(0.0, 0.5))


def main():
    src = sys.argv[1]
    S = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 512
    p = lambda n: os.path.join(src, n + '_1K-PNG.zip')
    rnd = random.Random(7)
    print('liście…')
    oak = leaves(p('LeafSet016')) + leaves(p('LeafSet012'), rotate=-90)
    poplar = leaves(p('LeafSet004'))
    birch = leaves(p('LeafSet014'))
    spruce = leaves(p('LeafSet019'), rotate=90)  # gałązki od lewej (nasada) w prawo – nasada na dół
    needles = leaves(p('PineNeedles001'))
    print('  dąb', len(oak), 'topola', len(poplar), 'brzoza', len(birch), 'świerk', len(spruce), 'igły', len(needles))
    gl = lambda L, g: [(gray(c, g), a, n) for c, a, n in L]
    oak, poplar, birch = gl(oak, 1.15), gl(poplar, 1.6), gl(birch, 1.05)
    spruce, needles = gl(spruce, 1.6), gl(needles, 1.9)

    def atlas(winter):
        cells = []
        for k in range(8):
            cell = Cell(S)
            if winter and k in (0, 1, 2, 3, 6, 7):
                bare(cell, rnd)
            elif k == 0:
                spray(cell, oak, rnd, 4, 0.24)
            elif k == 1:
                spray(cell, poplar, rnd, 4, 0.21)
            elif k == 2:
                spray(cell, birch, rnd, 5, 0.16)
            elif k == 3:
                spray(cell, birch + poplar, rnd, 4, 0.24)
            elif k == 4:
                big = max(spruce, key=lambda l: l[0].height)
                cell.paste(big, S / 2, S - 2, S * 0.98, 0)
            elif k == 5:
                tufts(cell, needles, rnd, 5)
            elif k == 6:
                for _ in range(60):
                    cell.paste(rnd.choice(oak + birch), rnd.uniform(0, S), rnd.uniform(S * 0.2, S * 1.1), S * rnd.uniform(0.25, 0.4), rnd.uniform(-180, 180), shade=rnd.uniform(0.6, 1.0), anchor=(0.5, 0.5))
            else:
                bare(cell, rnd)
            cells.append(cell)
        col = Image.new('RGBA', (4 * S, 2 * S))
        nor = Image.new('RGB', (4 * S, 2 * S))
        for k, cell in enumerate(cells):
            pos = ((k % 4) * S, (k // 4) * S)
            # (kolor pod przezroczystymi brzegami – rozlany kolor liści, bez szarej obwódki przy filtrowaniu)
            rgba = cell.c.copy()
            rgba.putalpha(cell.a)
            col.paste(rgba, pos)
            nor.paste(cell.n, pos)
        return col, nor

    os.makedirs(OUT, exist_ok=True)
    for winter in (False, True):
        col, nor = atlas(winter)
        name = 'foliage-winter' if winter else 'foliage'
        col.save(os.path.join(OUT, name + '_color.webp'), quality=90, method=6, exact=True)
        nor.save(os.path.join(OUT, name + '_normal.webp'), quality=88, method=6)
        print('zapisano', name)


if __name__ == '__main__':
    main()
