#!/usr/bin/env python3
"""檢查：地面道路的中心線上有沒有被建物擋住（車子碰撞半徑 0.95 m）。
用法: python3 tools/audit_roads.py [web/data] [out.json]
"""
import sys, json, glob, math, os
from collections import defaultdict, Counter
import numpy as np, shapely, shapely.ops
from shapely.geometry import Polygon, LineString, Point
from shapely.strtree import STRtree

D = sys.argv[1] if len(sys.argv) > 1 else 'web/data'
OUT = sys.argv[2] if len(sys.argv) > 2 else None
meta = json.load(open(os.path.join(D, 'meta.json')))
TILE = meta.get('tile', 2000)
blds, binfo, roads = [], [], []
for f in sorted(glob.glob(os.path.join(D, 't_*.json'))):
    t = json.load(open(f)); ox, oz = t['tx'] * TILE, t['tz'] * TILE
    for ck, c in t['cells'].items():
        for b in c.get('b', []):
            p = b[2]; pts = [(ox + p[i] / 10, oz + p[i + 1] / 10) for i in range(0, len(p), 2)]
            if len(pts) < 3: continue
            if len(b) > 7 and b[7] > 0: continue      # 懸空在路上方的樓層：車子從底下過
            g = Polygon(pts)
            if not g.is_valid: g = g.buffer(0)
            blds.append(g); binfo.append(dict(h=b[0] / 10, bt=b[1], gen=b[6] if len(b) > 6 else 0, tile=os.path.basename(f), cell=ck))
        for r in c.get('r', []):
            raw = r[10]; pts = [(ox + raw[i] / 10, oz + raw[i + 1] / 10) for i in range(0, len(raw), 2)]
            roads.append(dict(a=r[8], b=r[9], id=r[0], cls=r[1], name=t['names'][r[2]] if r[2] is not None and r[2] < len(t['names']) else '', width=r[3] / 10,
                              flags=r[7], pts=pts, rel=[v / 10 for v in r[14]] if len(r) > 14 and r[14] else None))
print('buildings', len(blds), 'roads', len(roads))
deg = Counter()
for e in roads: deg[e['a']] += 1; deg[e['b']] += 1
tree = STRtree(blds)
samples, owner = [], []
for ri, e in enumerate(roads):
    if e['flags'] & 2: continue           # 隧道
    ls = LineString(e['pts']); L = ls.length
    n = max(2, int(L / 2))
    for k in range(n + 1):
        s = L * k / n
        if e['rel'] is not None:
            # rel 對應每個頂點；用最近頂點的值近似
            cum = np.concatenate([[0], np.cumsum([math.dist(e['pts'][i], e['pts'][i + 1]) for i in range(len(e['pts']) - 1)])])
            i = int(np.searchsorted(cum, s)); i = min(max(i, 0), len(e['rel']) - 1)
            if e['rel'][i] > 2.5: continue
        # 死巷的盡頭（路就停在建物前面）不算擋住
        if (deg[e['a']] == 1 and s < 3.0) or (deg[e['b']] == 1 and s > L - 3.0): continue
        p = ls.interpolate(s); samples.append(p); owner.append((ri, s))
print('samples', len(samples))
pi, bi = tree.query(samples, predicate='dwithin', distance=0.95)
hits = defaultdict(set)     # road -> set of buildings
spots = defaultdict(list)
for a, b in zip(pi, bi):
    ri, s = owner[a]; hits[ri].add(int(b)); spots[(ri, int(b))].append(s)
# 中心線真的在建物裡面（不只是擦邊）
pin, bin_ = tree.query(samples, predicate='within')
inside = set(zip([owner[a][0] for a in pin], [int(b) for b in bin_]))
blockers = Counter(); bys = Counter(); out = []
for (ri, b), ss in spots.items():
    e = roads[ri]; info = binfo[b]
    # 車子的寬度能不能從旁邊過：看這段路在該建物旁邊的可用寬度
    ls = LineString(e['pts'])
    # 剩下的部分還能不能讓中心線方向通過：用最小的「橫斷面」寬度估計
    worst = e['width']
    for s in np.linspace(max(0, min(ss)), min(ls.length, max(ss)), 6):
        p = ls.interpolate(s); q = ls.interpolate(min(ls.length, s + 0.5)); r0 = ls.interpolate(max(0, s - 0.5))
        dx, dz = q.x - r0.x, q.y - r0.y; Ln = math.hypot(dx, dz) or 1; nx, nz = -dz / Ln, dx / Ln
        cut = LineString([(p.x - nx * e['width'] / 2, p.y - nz * e['width'] / 2), (p.x + nx * e['width'] / 2, p.y + nz * e['width'] / 2)])
        rem = cut.difference(blds[b].buffer(0.95))
        wmax = max((g.length for g in getattr(rem, 'geoms', [rem]) if not g.is_empty), default=0)
        worst = min(worst, wmax)
    blocked = worst < 0.2     # 中間沒有可以讓車子中心通過的空隙
    kind = 'gen' if info['gen'] else 'osm'
    c = blds[b].centroid
    out.append(dict(road=e['id'], name=e['name'], cls=e['cls'], width=e['width'], b=b, kind=kind, bt=info['bt'], h=info['h'], area=round(blds[b].area),
                    inside=(ri, b) in inside, free=round(worst, 2), blocked=blocked, len=round(max(ss) - min(ss) + 2, 1), x=round(c.x, 1), z=round(c.y, 1),
                    tile=info['tile'], cell=info['cell']))
    if blocked: blockers[kind] += 1; bys[(kind, info['bt'])] += 1
print('road/building contacts:', len(out), 'fully blocked:', sum(1 for o in out if o['blocked']))
print('blocked by kind:', dict(blockers)); print('blocked by (kind,bt):', dict(bys))
print('blocked by road cls:', dict(Counter(o['cls'] for o in out if o['blocked'])))
print('partial (narrowed) by kind:', dict(Counter(o['kind'] for o in out if not o['blocked'])))
if OUT: json.dump(out, open(OUT, 'w'), ensure_ascii=False)
