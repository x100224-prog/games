#!/usr/bin/env python3
"""小遊戲用：在 OSM 路網上算起點→終點的幾條路線，取路線兩側一定寬度當作地圖範圍。

用法: python3 tools/route_corridor.py <pbf> <out_prefix> <lon0,lat0> <lon1,lat1> [buffer_m]
輸出: <out_prefix>.wkt（範圍多邊形，經緯度）、<out_prefix>_routes.json（路線座標）
"""
import sys, json, math, time
import osmium, networkx as nx
from shapely.geometry import LineString, Point
from shapely.ops import unary_union

SRC, OUT = sys.argv[1], sys.argv[2]
A = tuple(map(float, sys.argv[3].split(','))); B = tuple(map(float, sys.argv[4].split(',')))
BUF = float(sys.argv[5]) if len(sys.argv) > 5 else 650.0
pad = 0.04
BB = (min(A[0], B[0]) - pad, min(A[1], B[1]) - pad, max(A[0], B[0]) + pad, max(A[1], B[1]) + pad)
SPEED = dict(motorway=90, motorway_link=50, trunk=70, trunk_link=45, primary=45, primary_link=35, secondary=40,
             secondary_link=30, tertiary=35, tertiary_link=25, unclassified=28, residential=25, living_street=15, service=12)
T0 = time.time()
G = nx.DiGraph(); pos = {}
fp = (osmium.FileProcessor(SRC).with_locations()
      .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)).with_filter(osmium.filter.KeyFilter('highway')))
for w in fp:
    hw = w.tags.get('highway')
    if hw not in SPEED or w.tags.get('access') in ('no', 'private') or w.tags.get('area') == 'yes': continue
    if hw == 'service' and w.tags.get('service') in ('parking_aisle', 'driveway'): continue
    ns = [(n.ref, n.lon, n.lat) for n in w.nodes if n.location.valid()]
    if not any(BB[0] <= x <= BB[2] and BB[1] <= y <= BB[3] for _, x, y in ns): continue
    ow = w.tags.get('oneway')
    oneway = ow in ('yes', '1', 'true') or (ow is None and (hw.startswith('motorway') or w.tags.get('junction') == 'roundabout'))
    rev = ow == '-1'
    sp = SPEED[hw]
    for (a, ax, ay), (b, bx, by) in zip(ns, ns[1:]):
        d = math.hypot((bx - ax) * 101000, (by - ay) * 110800)
        pos[a] = (ax, ay); pos[b] = (bx, by)
        t = d / (sp / 3.6)
        kw = dict(t=t, d=d, hw=hw, nm=w.tags.get('name') or '')
        if rev: G.add_edge(b, a, **kw)
        else:
            G.add_edge(a, b, **kw)
            if not oneway: G.add_edge(b, a, **kw)
print('graph', G.number_of_nodes(), G.number_of_edges(), '%.0fs' % (time.time() - T0))

def nearest(p):
    return min(pos, key=lambda n: (pos[n][0] - p[0]) ** 2 + ((pos[n][1] - p[1]) * 1.1) ** 2 if n in G else 1e9)
sa, sb = nearest(A), nearest(B)
routes = {}
def run(name, weight):
    path = nx.shortest_path(G, sa, sb, weight=weight)
    routes[name] = [pos[n] for n in path]
    L = sum(G[u][v]['d'] for u, v in zip(path, path[1:])); T = sum(G[u][v]['t'] for u, v in zip(path, path[1:]))
    print(name, 'km %.1f' % (L / 1000), 'min %.1f' % (T / 60), 'via', sorted({G[u][v]['hw'] for u, v in zip(path, path[1:])})[:6])
run('fastest', 't')
run('surface', lambda u, v, e: e['t'] * (4 if e['hw'].startswith(('motorway', 'trunk')) else 1))
run('shortest', 'd')
# 走新北環快（新北環河快速道路）：環快路段的時間打很大的折扣，讓路線一定經過它
import re
HK = re.compile('環河快速|環快')
run('huankuai', lambda u, v, e: e['t'] * (0.15 if HK.search(e['nm']) else 1))
lat0 = (A[1] + B[1]) / 2
deg = BUF / 111000
lines = [LineString([(x, y * 1) for x, y in r]) for r in routes.values()]
poly = unary_union([l.buffer(deg) for l in lines] + [Point(A).buffer(deg * 1.2), Point(B).buffer(deg * 1.3)]).simplify(deg * 0.1)
open(OUT + '.wkt', 'w').write(poly.wkt)
json.dump(dict(start=A, dest=B, routes=routes), open(OUT + '_routes.json', 'w'))
print('corridor area km2 %.1f' % (poly.area * 101000 * 110800 / 1e6))
