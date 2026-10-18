#!/usr/bin/env python3
"""全螢幕地圖用的路名與停車場位置（從地圖小格 web/data/t_*.json 整理），輸出 web/data/maplabels.json。
路名：每條有名字的路，沿著路每隔一段放一個標籤點（大路隔遠一點），同名的標籤彼此至少隔一段距離。
停車場：每個停車場多邊形的中心點。"""
import json, glob, math, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = os.path.join(ROOT, 'web', 'data')
meta = json.load(open(os.path.join(D, 'meta.json')))
TILE = meta['cell'] * meta['tileCells']
STEP = {0: 300, 1: 300, 2: 220, 3: 200, 4: 160, 5: 120, 6: 100, 7: 300}
GAP = {0: 900, 1: 800, 2: 600, 3: 480, 4: 360, 5: 240, 6: 200, 7: 900}
names, nidx = [], {}
cand = {}          # name -> [(x, z, ang, cls)]
lots = []
for f in sorted(glob.glob(os.path.join(D, 't_*.json'))):
    t = json.load(open(f)); ox, oz = t['tx'] * TILE, t['tz'] * TILE; nm = t['names']
    for key, c in t['cells'].items():
        for r in c.get('r', []):
            cls = r[1]
            if cls > 6: continue
            name = nm[r[2]] if r[2] < len(nm) else ''
            if not name: continue
            raw = r[10]; pts = [(ox + raw[i] / 10, oz + raw[i + 1] / 10) for i in range(0, len(raw), 2)]
            acc, nxt = 0.0, STEP[cls] / 2
            for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
                L = math.hypot(x1 - x0, z1 - z0)
                if L < 0.5: continue
                while acc + L >= nxt:
                    u = (nxt - acc) / L; ang = math.degrees(math.atan2(z1 - z0, x1 - x0))
                    if ang > 90: ang -= 180
                    if ang < -90: ang += 180
                    cand.setdefault(name, []).append((x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, ang, cls))
                    nxt += STEP[cls]
                acc += L
        for p in c.get('p', []):
            ring = p[1] if isinstance(p[1], list) else None
            if not ring or len(ring) < 6: continue
            xs = [ox + ring[i] / 10 for i in range(0, len(ring), 2)]; zs = [oz + ring[i + 1] / 10 for i in range(0, len(ring), 2)]
            area = 0.0
            for i in range(len(xs)):
                j = (i + 1) % len(xs); area += xs[i] * zs[j] - xs[j] * zs[i]
            lots.append((sum(xs) / len(xs), sum(zs) / len(zs), abs(area) / 2))
L = []
for name, pts in cand.items():
    pts.sort(key=lambda p: p[3])   # 大路的點先放
    keep = []
    for x, z, a, cls in pts:
        g = GAP[cls]
        if all((x - k[0]) ** 2 + (z - k[1]) ** 2 > g * g for k in keep): keep.append((x, z, a, cls))
    if name not in nidx: nidx[name] = len(names); names.append(name)
    for x, z, a, cls in keep: L += [round(x), round(z), round(a), cls, nidx[name]]
P = []
for x, z, a in lots:
    if a >= 150: P += [round(x), round(z)]
out = {'names': names, 'L': L, 'P': P}
s = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
open(os.path.join(D, 'maplabels.json'), 'w', encoding='utf-8').write(s)
print('names', len(names), 'labels', len(L) // 5, 'lots', len(P) // 2, 'bytes', len(s.encode('utf-8')))
