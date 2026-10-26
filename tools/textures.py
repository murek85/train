#!/usr/bin/env python3
"""Przygotowanie tekstur PBR do gry (js/3d/textures.js) z pobranego zestawu ambientCG lub Poly Haven (CC0).

Użycie:
  python tools/textures.py <folder lub .zip zestawu> <grupa/nazwa> [--scale 2.0] [--sizes 1024,2048]

Rozpoznawane mapy (nazwy plików ambientCG / Poly Haven):
  kolor          *_Color.*, *_diff_*, *_diffuse_*, *_albedo*
  normalne (GL)  *_NormalGL.*, *_nor_gl_*            (wersja DirectX *_NormalDX.* / *_nor_dx_* – odwrócone G)
  chropowatość   *_Roughness.*, *_rough_*
  okluzja        *_AmbientOcclusion.*, *_ao_*
  metaliczność   *_Metalness.*, *_metal_*
  gotowe ARM     *_arm_*                              (Poly Haven: AO, chropowatość, metaliczność – jak ORM)
Wynik: textures/<grupa>/<nazwa>_{color,normal,orm}_{1k,2k}.webp i wpis w textures/index.json (scale – metry na
kafel w świecie gry, mean – średni kolor liniowy). ORM: R – okluzja (brak: 1), G – chropowatość (brak: 0,8), B – metaliczność (brak: 0).
Brak mapy normalnych – zestaw bez niej (materiał bez wypukłości). Licencja zestawu: CC0 (zapisana w spisie).
"""
import io
import json
import os
import re
import sys
import zipfile

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'textures')

PATTERNS = {
    'color': [r'_color\b', r'_diff(use)?_', r'_albedo', r'_basecolor'],
    'normal_gl': [r'_normalgl\b', r'_nor_gl_'],
    'normal_dx': [r'_normaldx\b', r'_nor_dx_'],
    'rough': [r'_roughness\b', r'_rough_'],
    'ao': [r'_ambientocclusion\b', r'_ao_'],
    'metal': [r'_metalness\b', r'_metal_'],
    'arm': [r'_arm_'],
}
IMG = re.compile(r'\.(jpe?g|png|tiff?|webp)$', re.I)


def sources(src):
    """{ rodzaj: (nazwa, bajty) } z folderu albo archiwum .zip"""
    files = []
    if os.path.isdir(src):
        for n in os.listdir(src):
            p = os.path.join(src, n)
            if os.path.isfile(p) and IMG.search(n):
                with open(p, 'rb') as f:
                    files.append((n, f.read()))
    else:
        with zipfile.ZipFile(src) as z:
            for n in z.namelist():
                if IMG.search(n) and not n.endswith('/'):
                    files.append((os.path.basename(n), z.read(n)))
    found = {}
    for kind, pats in PATTERNS.items():
        for name, data in files:
            low = name.lower()
            if any(re.search(p, low) for p in pats):
                # największa rozdzielczość, jeśli jest kilka (np. 2K i 4K w jednym folderze)
                if kind not in found or len(data) > len(found[kind][1]):
                    found[kind] = (name, data)
    return found


def open_img(data, mode):
    im = Image.open(io.BytesIO(data))
    if im.mode in ('I;16', 'I;16B', 'I'):
        im = im.point(lambda v: v / 256).convert('L')
    return im.convert(mode)


def square(im, n):
    return im.resize((n, n), Image.LANCZOS)


def build(found, n):
    out = {}
    out['color'] = square(open_img(found['color'][1], 'RGB'), n)
    nm = None
    if 'normal_gl' in found:
        nm = square(open_img(found['normal_gl'][1], 'RGB'), n)
    elif 'normal_dx' in found:
        r, g, b = square(open_img(found['normal_dx'][1], 'RGB'), n).split()
        nm = Image.merge('RGB', (r, g.point(lambda v: 255 - v), b))
    if nm is not None:
        out['normal'] = nm
    if 'arm' in found:
        out['orm'] = square(open_img(found['arm'][1], 'RGB'), n)
    else:
        ao = square(open_img(found['ao'][1], 'L'), n) if 'ao' in found else Image.new('L', (n, n), 255)
        ro = square(open_img(found['rough'][1], 'L'), n) if 'rough' in found else Image.new('L', (n, n), 204)
        me = square(open_img(found['metal'][1], 'L'), n) if 'metal' in found else Image.new('L', (n, n), 0)
        out['orm'] = Image.merge('RGB', (ao, ro, me))
    return out


def main(argv):
    args, opts, i = [], {}, 0
    while i < len(argv):
        if argv[i].startswith('--') and i + 1 < len(argv):
            opts[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            args.append(argv[i])
            i += 1
    if len(args) < 2:
        print(__doc__)
        return 1
    src, name = args[0], args[1].strip('/')
    scale = float(opts.get('scale', 2.0))
    sizes = [int(s) for s in opts.get('sizes', '1024,2048').split(',')]
    found = sources(src)
    if 'color' not in found:
        print('Brak mapy koloru w', src, '– znalezione:', ', '.join(found) or 'nic')
        return 1
    print('Mapy:', ', '.join(f'{k}={v[0]}' for k, v in found.items()))
    os.makedirs(os.path.join(OUT, os.path.dirname(name)), exist_ok=True)
    maps = None
    total = 0
    for n in sizes:
        lab = f'{n // 1024}k' if n >= 1024 else str(n)
        imgs = build(found, n)
        maps = {k: ('srgb' if k == 'color' else 'linear') for k in imgs}
        for k, im in imgs.items():
            p = os.path.join(OUT, f'{name}_{k}_{lab}.webp')
            # kolor i mapy techniczne stratnie (jakość 90 i 88 – wyżej prawie bez różnicy wobec źródeł JPG, o 30% większe)
            im.save(p, 'WEBP', quality=90 if k == 'color' else 88, method=6)
            total += os.path.getsize(p)
    idx_path = os.path.join(OUT, 'index.json')
    idx = {'version': 1, 'sets': {}}
    if os.path.exists(idx_path):
        with open(idx_path, encoding='utf-8') as f:
            idx = json.load(f)
    src_name = os.path.basename(os.path.normpath(src))
    # średni kolor (liniowy) – shader zabarwia teksturę kolorem z danych: kolor terenu × tekstura / średnia
    small = open_img(found['color'][1], 'RGB').resize((64, 64), Image.BOX)
    lin = lambda v: (v / 255) / 12.92 if v <= 10 else ((v / 255 + 0.055) / 1.055) ** 2.4
    px = [small.getpixel((x, y)) for y in range(64) for x in range(64)]
    mean = [round(sum(lin(c[i]) for c in px) / len(px), 4) for i in range(3)]
    idx['sets'][name] = {'maps': maps, 'sizes': sizes, 'ext': 'webp', 'scale': scale, 'mean': mean, 'source': src_name, 'license': 'CC0'}
    idx['sets'] = dict(sorted(idx['sets'].items()))
    with open(idx_path, 'w', encoding='utf-8') as f:
        json.dump(idx, f, ensure_ascii=False, indent='\t')
        f.write('\n')
    print(f'{name}: {", ".join(maps)} × {len(sizes)} rozdzielczości, {total / 1048576:.1f} MB')
    return 0


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')  # konsola Windows
    sys.exit(main(sys.argv[1:]))
