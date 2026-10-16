#!/usr/bin/env python3
"""Stage 2 — 把 extract_osm.py 的輸出轉成遊戲用的區塊檔。

用法: python3 tools/build_tiles.py <extract.pkl> <out_dir> <內政部20mDEM.zip>

輸出:
  out_dir/meta.json        投影參數、行政區、可選住址、工作地點、區塊清單
  out_dir/t_<tx>_<tz>.json 每 2 km 一個區塊檔，內含 16 個 500 m 小格
  out_dir/nav.json         全市路網（節點＋邊，無幾何），留給之後的自動導航用

座標系: x = 東 (+)，z = 南 (+)，單位公尺，原點在 (LON0, LAT0)。
區塊檔內的座標是相對該區塊原點、以 0.1 m 為單位的整數。
"""
import sys, os, json, math, pickle, heapq, hashlib, time, random
from collections import defaultdict
import numpy as np
import shapely
from shapely import wkb
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from shapely.strtree import STRtree
from shapely.prepared import prep

SRC, OUT, DEM = sys.argv[1], sys.argv[2], sys.argv[3]
# 第 4 個參數（可省略）：小遊戲任務（route_corridor.py 輸出的 *_routes.json）
MISSION = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from terrain import Terrain
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
def log(*a): print(f"[{time.time()-T0:6.1f}s]", *a, flush=True)

LON0, LAT0 = 121.5450, 25.0600
_phi = math.radians(LAT0)
MLAT = 111132.92 - 559.82 * math.cos(2 * _phi) + 1.175 * math.cos(4 * _phi)
MLON = 111412.84 * math.cos(_phi) - 93.5 * math.cos(3 * _phi)
def proj(lon, lat): return ((lon - LON0) * MLON, -(lat - LAT0) * MLAT)
def proj_geom(g):
    return shapely.transform(g, lambda a: np.column_stack(((a[:, 0] - LON0) * MLON, -(a[:, 1] - LAT0) * MLAT)))

CELL = 500.0      # 小格邊長 (m)
TILE_CELLS = 4    # 每個區塊檔 4x4 小格 = 2 km
TILE = CELL * TILE_CELLS
def cell_of(x, z): return (math.floor(x / CELL), math.floor(z / CELL))
def tile_of_cell(c): return (c[0] // TILE_CELLS, c[1] // TILE_CELLS)

def hsh(*a):
    return int(hashlib.md5('|'.join(map(str, a)).encode()).hexdigest()[:8], 16)

D = pickle.load(open(SRC, 'rb'))
city = proj_geom(wkb.loads(D['city']))
log("loaded", {k: (len(v) if hasattr(v, '__len__') else 1) for k, v in D.items()})

# ====================================================================== 行政區
districts = []
for d in D['districts']:
    g = proj_geom(wkb.loads(d['geom']))
    districts.append(dict(name=d['name'], en=d.get('name_en') or '', level=d['level'], geom=g))
# 取數量最接近 12 的那一層
by_lvl = defaultdict(list)
for d in districts: by_lvl[d['level']].append(d)
lvl = min(by_lvl, key=lambda k: abs(len(by_lvl[k]) - 12))
districts = sorted(by_lvl[lvl], key=lambda d: -d['geom'].area)
log("districts level", lvl, [d['name'] for d in districts])
dist_tree = STRtree([d['geom'] for d in districts])
def district_of(x, z):
    p = Point(x, z)
    for i in dist_tree.query(p):
        if districts[i]['geom'].contains(p): return int(i)
    return -1

# ====================================================================== 道路
CLS = dict(motorway=0, trunk=1, primary=2, secondary=3, tertiary=4, unclassified=5, residential=5,
           living_street=5, service=6, motorway_link=7, trunk_link=7, primary_link=7, secondary_link=7,
           tertiary_link=7)
LINK_PARENT = dict(motorway_link=0, trunk_link=1, primary_link=2, secondary_link=3, tertiary_link=4)
DEF_SPEED = [80, 60, 50, 50, 40, 30, 20, 40]
LANE_W = [3.5, 3.4, 3.2, 3.2, 3.1, 2.9, 3.0, 3.6]

def pint(s, default=None):
    if s is None: return default
    try: return int(float(str(s).split(';')[0].split()[0]))
    except Exception: return default

ways = []
for r in D['roads']:
    t = r['tags']; hw = t['highway']
    if t.get('area') == 'yes': continue
    if t.get('access') in ('no', 'private') or t.get('motor_vehicle') == 'no' or t.get('motorcar') == 'no': continue
    if hw == 'service' and t.get('service') in ('driveway', 'drive-through', 'emergency_access', 'parking_aisle'): continue
    cls = CLS[hw]
    ow = t.get('oneway')
    pts, nodes = r['pts'], r['nodes']
    oneway = 0
    if ow in ('yes', 'true', '1'): oneway = 1
    elif ow == '-1': oneway = 1; pts = pts[::-1]; nodes = nodes[::-1]
    elif ow is None and (hw in ('motorway', 'motorway_link') or t.get('junction') == 'roundabout'): oneway = 1
    lanes = pint(t.get('lanes'))
    if lanes is None or lanes < 1 or lanes > 8:
        lanes = {0: 3, 1: 2 if oneway else 4, 2: 3 if oneway else 4, 3: 2 if oneway else 4,
                 4: 2, 5: 1 if oneway else 2, 6: 1, 7: 1}[cls]
    if not oneway and lanes == 1 and cls <= 4: lanes = 2
    if cls == 6: width = 4.2 if lanes == 1 else 5.6
    elif cls == 5: width = 4.6 if lanes == 1 else lanes * 2.9 + 1.0
    else: width = lanes * LANE_W[cls] + 1.0
    speed = pint(t.get('maxspeed'), DEF_SPEED[cls])
    if speed < 10 or speed > 110: speed = DEF_SPEED[cls]
    layer = 0
    if t.get('bridge') not in (None, 'no'):
        layer = max(1, pint(t.get('layer'), 1) or 1)
    tunnel = 1 if t.get('tunnel') not in (None, 'no', 'building_passage', 'culvert') else 0
    name = (t.get('name') or t.get('ref') or '').split(';')[0].strip()
    ways.append(dict(id=r['id'], cls=cls, name=name, en=(t.get('name:en') or '').split(';')[0].strip(), oneway=oneway, lanes=lanes, width=width, speed=speed,
                     layer=layer, tunnel=tunnel, pts=pts, nodes=nodes))
log("drivable ways:", len(ways))

# --- 在路口切開
use = defaultdict(int)
for w in ways:
    for i, n in enumerate(w['nodes']):
        use[n] += 2 if i in (0, len(w['nodes']) - 1) else 1
raw_edges = []
for w in ways:
    ns, ps = w['nodes'], w['pts']
    s = 0
    for i in range(1, len(ns)):
        if i == len(ns) - 1 or use[ns[i]] > 1:
            if ns[s] != ns[i] or i - s > 2:
                raw_edges.append((w, ns[s], ns[i], ps[s:i + 1]))
            s = i
log("raw edges:", len(raw_edges))

# --- 只留最大連通塊
parent = {}
def find(a):
    while parent.setdefault(a, a) != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
for _, a, b, _p in raw_edges:
    ra, rb = find(a), find(b)
    if ra != rb: parent[ra] = rb
comp = defaultdict(int)
for _, a, b, _p in raw_edges: comp[find(a)] += 1
main = max(comp, key=comp.get)
raw_edges = [e for e in raw_edges if find(e[1]) == main]
log("edges in main component:", len(raw_edges), "of components", len(comp))

# --- 投影、簡化、加密、切段
node_id = {}
node_xy = []
def nid(key, xy):
    if key not in node_id:
        node_id[key] = len(node_xy); node_xy.append(xy)
    return node_id[key]

edges = []
MAX_EDGE = 220.0
for w, a, b, ps in raw_edges:
    xy = [proj(*p) for p in ps]
    ls = LineString(xy)
    if ls.length < 0.5: continue
    ls = ls.simplify(0.4, preserve_topology=False)
    ls = shapely.segmentize(ls, 18.0 if (w['layer'] or w['tunnel']) else 90.0)
    c = list(ls.coords)
    c[0], c[-1] = xy[0], xy[-1]
    # 切成 <= MAX_EDGE 的段
    parts, cur, acc = [], [c[0]], 0.0
    for i in range(1, len(c)):
        seg = math.dist(c[i - 1], c[i])
        if acc + seg > MAX_EDGE and len(cur) > 1:
            parts.append(cur); cur = [c[i - 1]]; acc = 0.0
        cur.append(c[i]); acc += seg
    parts.append(cur)
    na = nid(('o', a), xy[0])
    for k, part in enumerate(parts):
        last = (k == len(parts) - 1)
        nb = nid(('o', b), xy[-1]) if last else nid(('s', w['id'], a, b, k), part[-1])
        if na == nb and len(part) < 4:
            na = nb; continue
        edges.append(dict(a=na, b=nb, pts=part, cls=w['cls'], name=w['name'], en=w['en'], oneway=w['oneway'],
                          lanes=w['lanes'], width=w['width'], speed=w['speed'], layer=w['layer'],
                          tunnel=w['tunnel'], len=LineString(part).length))
        na = nb
N = len(node_xy)
log("edges:", len(edges), "nodes:", N, "total km: %.0f" % (sum(e['len'] for e in edges) / 1000))

# --- 高架高度：從地面節點以固定坡度往上「長」
SLOPE = 0.055
def layer_h(l): return 1.0 + 5.5 * l
node_ground = [False] * N
node_target = [0.0] * N
for e in edges:
    for n in (e['a'], e['b']):
        if e['layer'] == 0: node_ground[n] = True
        else: node_target[n] = max(node_target[n], layer_h(e['layer']))
node_h = [0.0 if node_ground[i] else node_target[i] for i in range(N)]
# 頂點圖：節點 ('n', id)，邊內部頂點 ('e', ei, k)
vh = {}
adj = defaultdict(list)
for ei, e in enumerate(edges):
    if not e['layer']: continue
    H = layer_h(e['layer'])
    keys = [('n', e['a'])] + [('e', ei, k) for k in range(1, len(e['pts']) - 1)] + [('n', e['b'])]
    for k, key in enumerate(keys):
        if key[0] == 'e': vh[key] = H
        else: vh[key] = node_h[key[1]]
        if k:
            d = math.dist(e['pts'][k - 1], e['pts'][k])
            adj[keys[k - 1]].append((key, d)); adj[key].append((keys[k - 1], d))
pq = [(0.0, k) for k, v in vh.items() if k[0] == 'n' and node_ground[k[1]]]
heapq.heapify(pq)
while pq:
    h, k = heapq.heappop(pq)
    if h > vh[k] + 1e-9: continue
    for k2, d in adj[k]:
        nh = h + SLOPE * d
        if nh < vh[k2] - 1e-9:
            vh[k2] = nh; heapq.heappush(pq, (nh, k2))
for k, v in vh.items():
    if k[0] == 'n': node_h[k[1]] = v
for ei, e in enumerate(edges):
    if e['layer']:
        e['h'] = [vh[('n', e['a'])]] + [vh[('e', ei, k)] for k in range(1, len(e['pts']) - 1)] + [vh[('n', e['b'])]]
        if max(e['h']) < 0.05: e['h'] = None
    else:
        e['h'] = None
log("elevated edges:", sum(1 for e in edges if e['h']))

# ====================================================================== 地形與道路絕對高度
T = Terrain(DEM, city.buffer(900).bounds, LON0, LAT0, MLON, MLAT, CELL)
log("terrain grid", T.nat.shape, "elev %.1f..%.1f m" % (float(T.nat.min()), float(T.nat.max())))
for ei, e in enumerate(edges):
    xs = [p[0] for p in e['pts']]; zs = [p[1] for p in e['pts']]
    g20 = T.sample(T.s20, xs, zs)
    if e['h']:
        g80 = T.sample(T.s80, xs, zs)
        rel = np.array(e['h']); w = np.clip(rel / layer_h(e['layer']), 0, 1)
        e['habs'] = ((1 - w) * g20 + w * g80 + rel).tolist()
    else:
        e['habs'] = g20.tolist()
# 隧道：入口固定在地面，中間用拉普拉斯平滑內插（不跟著山頂起伏）
tkeys, tadj, tval = {}, defaultdict(list), {}
non_tunnel_nodes = set()
for e in edges:
    if not (e['tunnel'] and not e['h']): non_tunnel_nodes.add(e['a']); non_tunnel_nodes.add(e['b'])
for ei, e in enumerate(edges):
    if not (e['tunnel'] and not e['h']): continue
    keys = [('n', e['a'])] + [('e', ei, k) for k in range(1, len(e['pts']) - 1)] + [('n', e['b'])]
    for k, key in enumerate(keys):
        tval.setdefault(key, e['habs'][k])
        if k: tadj[keys[k - 1]].append(key); tadj[key].append(keys[k - 1])
free = [k for k in tval if not (k[0] == 'n' and k[1] in non_tunnel_nodes)]
for _ in range(400):
    for k in free:
        nb_ = tadj[k]
        if nb_: tval[k] = sum(tval[q_] for q_ in nb_) / len(nb_)
# 地下道：從入口往裡以 7% 坡度往下，最深 7 m（山區隧道本來就在地形很深處，不受影響）
tdep = {k: 0.0 if (k[0] == 'n' and k[1] in non_tunnel_nodes) else 1e9 for k in tval}
tpos = {}
for ei, e in enumerate(edges):
    if not (e['tunnel'] and not e['h']): continue
    keys = [('n', e['a'])] + [('e', ei, k) for k in range(1, len(e['pts']) - 1)] + [('n', e['b'])]
    for k, key in enumerate(keys): tpos[key] = e['pts'][k]
pq = [(0.0, k) for k, v in tdep.items() if v == 0.0]; heapq.heapify(pq)
while pq:
    d0, k = heapq.heappop(pq)
    if d0 > tdep[k]: continue
    for k2 in tadj[k]:
        nd = d0 + math.dist(tpos[k], tpos[k2])
        if nd < tdep[k2]: tdep[k2] = nd; heapq.heappush(pq, (nd, k2))
for ei, e in enumerate(edges):
    if not (e['tunnel'] and not e['h']): continue
    keys = [('n', e['a'])] + [('e', ei, k) for k in range(1, len(e['pts']) - 1)] + [('n', e['b'])]
    xs = [p[0] for p in e['pts']]; zs = [p[1] for p in e['pts']]
    g20 = T.sample(T.s20, xs, zs)
    e['habs'] = [min(tval[k], float(g20[i]) - min(7.0, 0.07 * min(tdep[k], 1e6))) for i, k in enumerate(keys)]
log("tunnel vertices smoothed:", len(free))
# 道路底下的地形整平
def road_segs():
    for e in edges:
        if e['h'] or e['tunnel']: continue
        p, h = e['pts'], e['habs']
        for i in range(len(p) - 1):
            yield (p[i][0], p[i][1], h[i], p[i + 1][0], p[i + 1][1], h[i + 1], e['width'] / 2)
log("terrain points carved under roads:", T.carve_roads(road_segs()))
# 地下道引道：路面低於地面、但還沒有頂的段落，地形在這裡開洞（遊戲端用擋土牆和地面邊緣補起來）
def ramp_segs():
    for e in edges:
        if not e['tunnel'] or e['h']: continue
        p, h = e['pts'], e['habs']
        g = T.sample(T.fin, [q_[0] for q_ in p], [q_[1] for q_ in p])
        for i in range(len(p) - 1):
            c0, c1 = g[i] - h[i], g[i + 1] - h[i + 1]
            if min(c0, c1) < 6.0 and max(c0, c1) > 0.6:
                yield (p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], e['width'] / 2)
log("terrain points opened for tunnel ramps:", T.mark_holes(ramp_segs()))

# --- 號誌：把 OSM 號誌點對到最近的路口節點
deg = [0] * N
for e in edges: deg[e['a']] += 1; deg[e['b']] += 1
junc = [i for i in range(N) if deg[i] >= 3 and node_h[i] < 0.5]
jtree = STRtree([Point(node_xy[i]) for i in junc])
signals = set()
nsig = 0
for n in D['nodes']:
    if n['tags'].get('highway') == 'traffic_signals':
        nsig += 1
        p = Point(proj(n['lon'], n['lat']))
        i = jtree.nearest(p)
        if p.distance(Point(node_xy[junc[i]])) < 38: signals.add(junc[i])
log("signal nodes:", nsig, "-> signalized junctions:", len(signals))

# ====================================================================== 區塊容器
cells = defaultdict(lambda: dict(r=[], b=[], w=[], p=[], poi=[], t=[], s=[], pk=[], rs=[]))
names_by_tile = defaultdict(dict)
def name_idx(tile, name):
    d = names_by_tile[tile]
    if name not in d: d[name] = len(d)
    return d[name]
def q(v, o): return int(round((v - o) * 10))
def flat(coords, ox, oz):
    out = []
    for x, z in coords: out.append(q(x, ox)); out.append(q(z, oz))
    return out

city_prep = prep(city)
inc = defaultdict(list)
for ei, e in enumerate(edges): inc[e['a']].append(ei); inc[e['b']].append(ei)
def trim_at(ei, n):
    """路口退縮距離：停止線到路口中心的距離（非路口為 0）。"""
    if deg[n] < 3: return 0.0
    others = [edges[k]['width'] for k in inc[n] if k != ei] or [6.0]
    t = max(others) / 2 + (4.5 if n in signals else 1.5)
    return min(t, edges[ei]['len'] * 0.45)

for ei, e in enumerate(edges):
    mid = LineString(e['pts']).interpolate(0.5, normalized=True)
    c = cell_of(mid.x, mid.y); t = tile_of_cell(c)
    ox, oz = t[0] * TILE, t[1] * TILE
    flags = (1 if e['h'] else 0) | (2 if e['tunnel'] else 0) | (4 if e['a'] in signals else 0) | (8 if e['b'] in signals else 0)
    # 16／32：起點／終點是「地圖範圍邊緣」的斷頭（接下去的路不在地圖裡）。車流開到這裡直接消失；
    # 高架或快速道路的這種斷頭，遊戲另外放封閉路障擋住玩家（以免開出斷橋）
    for bit, n, k in ((16, e['a'], 0), (32, e['b'], -1)):
        if deg[n] == 1:
            p_ = Point(e['pts'][k])
            if not city_prep.contains(p_) or city.boundary.distance(p_) < 120:
                flags |= bit
    # [11] 每個頂點的絕對高度 (dm)；[14] 高架路段離地高度 (dm)
    rec = [ei, e['cls'], name_idx(t, e['name']), int(round(e['width'] * 10)), e['lanes'], e['oneway'], e['speed'],
           flags, e['a'], e['b'], flat(e['pts'], ox, oz), [int(round(h * 10)) for h in e['habs']],
           int(round(trim_at(ei, e['a']) * 10)), int(round(trim_at(ei, e['b']) * 10)),
           [int(round(h * 10)) for h in e['h']] if e['h'] else 0,
           # [15] 隧道頂上的覆土厚度 (dm)：地形高度 − 路面高度
           [int(round((float(g_) - h_) * 10)) for g_, h_ in zip(T.sample(T.fin, [p_[0] for p_ in e['pts']], [p_[1] for p_ in e['pts']]), e['habs'])] if e['tunnel'] else 0]
    cells[c]['r'].append(rec)
    e['cell'] = c

# ====================================================================== 路名牌
# 依交通標誌規則第 99 條「路名標誌（指25）用以指示相交道路之名稱，設於相交路口」，並參考街景的實際做法：
#  - 有紅綠燈的路口：牌子掛在號誌燈桿的橫臂上（綠底白字、中文＋英文、箭頭指向相交道路的方向），
#    燈桿本身再貼一塊直式路名牌                                        → 種類 1
#  - 沒有紅綠燈的路口：路口右前方一支獨立的路名牌桿                     → 種類 0
# 記錄：[中文名, 英文名, x, z, 法線x*100, 法線z*100, 地面高(dm), 種類, 箭頭(1=左 2=右), 橫臂長(dm)]
def point_at(pts, s_):
    acc = 0.0
    for i in range(len(pts) - 1):
        L_ = math.dist(pts[i], pts[i + 1])
        if acc + L_ >= s_ or i == len(pts) - 2:
            t_ = 0 if L_ == 0 else max(0.0, min(1.0, (s_ - acc) / L_))
            return (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t_, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t_), \
                   ((pts[i + 1][0] - pts[i][0]) / (L_ or 1), (pts[i + 1][1] - pts[i][1]) / (L_ or 1))
        acc += L_
def arm_len(width): return max(4.0, min(8.5, width * 0.55 + 1.5))
n_rs = [0, 0]
for n in junc:
    if len(inc[n]) > 6: continue
    for ei in inc[n]:
        e = edges[ei]
        if e['cls'] in (0, 6, 7) or e['h'] or e['tunnel'] or e['len'] < 12: continue
        if e['oneway'] and e['a'] == n: continue            # 單行道只有駛入這個路口的方向才需要
        pts = e['pts']
        p0, p1 = (pts[1], pts[0]) if e['a'] == n else (pts[-2], pts[-1])
        dx, dz = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dz) or 1; dx /= L; dz /= L
        rx, rz = -dz, dx
        best, bdot = None, 0.75
        for ej in inc[n]:
            if ej == ei: continue
            f = edges[ej]
            if not f['name'] or f['name'] == e['name'] or f['cls'] in (0, 7) or f['h'] or f['tunnel']: continue
            qp = f['pts']; q0, q1 = (qp[0], qp[1]) if f['a'] == n else (qp[-1], qp[-2])
            fx, fz = q1[0] - q0[0], q1[1] - q0[1]; fl = math.hypot(fx, fz) or 1
            dot = abs(dx * fx / fl + dz * fz / fl)
            if dot < bdot: bdot, best = dot, f
        if best is None: continue
        # 相交道路往左、往右是否都有
        arrows = 0
        for ej in inc[n]:
            f = edges[ej]
            if f['name'] != best['name']: continue
            qp = f['pts']; q0, q1 = (qp[0], qp[1]) if f['a'] == n else (qp[-1], qp[-2])
            fx, fz = q1[0] - q0[0], q1[1] - q0[1]; fl = math.hypot(fx, fz) or 1
            side = (fx * rx + fz * rz) / fl
            if side < -0.3: arrows |= 1
            elif side > 0.3: arrows |= 2
        signal = n in signals and e['cls'] <= 5
        trim = round(trim_at(ei, n) * 10) / 10
        if signal and trim >= 5:
            # 跟遊戲裡號誌燈桿同一個位置：停止線上、右側路緣外 0.9 m
            s_stop = e['len'] - trim if e['b'] == n else trim
            (px, pz), (sdx, sdz) = point_at(pts, s_stop)
            if e['a'] == n: sdx, sdz = -sdx, -sdz
            side_off = (e['width'] - 1) / 2 + 0.9
            x = px - sdz * side_off; z = pz + sdx * side_off; kind = 1; ndx, ndz = sdx, sdz
        else:
            back = best['width'] / 2 + 2.0; off = e['width'] / 2 + (1.3 if e['cls'] <= 4 else 0.45)   # 巷弄沒有人行道，牌子貼著路邊
            x = node_xy[n][0] - dx * back + rx * off; z = node_xy[n][1] - dz * back + rz * off; kind = 0; ndx, ndz = dx, dz
        c = cell_of(x, z); tl = tile_of_cell(c); ox, oz = tl[0] * TILE, tl[1] * TILE
        y = float(T.sample(T.fin, [x], [z])[0])
        cells[c]['rs'].append([name_idx(tl, best['name']), name_idx(tl, best['en']) if best['en'] else -1,
                               q(x, ox), q(z, oz), int(round(-ndx * 100)), int(round(-ndz * 100)), int(round(y * 10)),
                               kind, arrows, int(round(arm_len(e['width']) * 10))])
        n_rs[kind] += 1
log("road name signs: standalone", n_rs[0], "on signal mast arms", n_rs[1])

# ====================================================================== 建物
BT = dict(residential=1, apartments=1, house=1, detached=1, dormitory=1, terrace=1,
          commercial=2, office=2, retail=2, hotel=2, supermarket=2,
          industrial=3, warehouse=3, manufacture=3, garage=3, garages=3, hangar=3,
          school=4, university=4, hospital=4, government=4, public=4, civic=4, college=4, kindergarten=4,
          train_station=4, transportation=4, stadium=4, sports_hall=4,
          temple=5, church=5, shrine=5, religious=5, chapel=5, mosque=5, pagoda=5,
          roof=6, shed=6, carport=6, hut=6, kiosk=6, greenhouse=6, service=6)
def pheight(s):
    if s is None: return None
    try: return float(str(s).replace('m', '').replace(',', '.').split()[0])
    except Exception: return None

# ---- 沒寫樓層的建物：用附近「有寫樓層、類型相同、佔地相近」的真實建物推算（中位數）
_lv_pts, _lv_val = [], []
for a in D['areas']:
    if a['kind'] != 'building': continue
    t = a['tags']; lv = pheight(t.get('building:levels'))
    if lv is None or not (0 < lv < 80): continue
    try: g = proj_geom(wkb.loads(a['geom']))
    except Exception: continue
    if g.area < 12: continue
    c_ = g.representative_point()
    _lv_pts.append((c_.x, c_.y, g.area, 1 if t.get('building') in ('apartments', 'residential', 'yes', 'house', 'terrace', 'detached') else 2, t.get('building')))
    _lv_val.append(lv)
from scipy.spatial import cKDTree as _KD
_lv_tree = _KD([(p_[0], p_[1]) for p_ in _lv_pts]) if _lv_pts else None
n_inferred = 0
def infer_levels(x, y, area, btag):
    """附近 600 m 內佔地相近（0.55～1.8 倍）、同類建物的樓層中位數；樣本不足回傳 None。"""
    if _lv_tree is None: return None
    idx = _lv_tree.query_ball_point((x, y), 600)
    cand = []
    for i in idx:
        px, py, pa, _, ptag = _lv_pts[i]
        if not (0.55 <= pa / area <= 1.8): continue
        same = (ptag == btag) or (btag in ('yes', None) and ptag in ('apartments', 'residential', 'yes'))
        if not same: continue
        cand.append((math.hypot(px - x, py - y), _lv_val[i]))
    if len(cand) < 3: return None
    cand.sort(); vals = sorted(v for _, v in cand[:9])
    return vals[len(vals) // 2]
log("buildings with real levels (for inference):", len(_lv_pts))

bld_geoms, bld_info = [], []
landmarks = []
bld_recs = []
nb = 0
for a in D['areas']:
    if a['kind'] != 'building': continue
    t = a['tags']
    if t.get('location') == 'underground': continue
    g = proj_geom(wkb.loads(a['geom']))
    polys = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
    bt = BT.get(t.get('building'), 0)
    if bt == 0:
        am = t.get('amenity')
        if am in ('school', 'university', 'hospital', 'college', 'townhall', 'library', 'kindergarten'): bt = 4
        elif am == 'place_of_worship': bt = 5
        elif t.get('office') or t.get('shop'): bt = 2
    for pi, poly in enumerate(polys):
        if poly.area < 12: continue
        ext = Polygon(poly.exterior).simplify(0.35, preserve_topology=True)
        if ext.is_empty or not isinstance(ext, Polygon) or ext.area < 12: continue
        if not shapely.is_ccw(ext.exterior): ext = Polygon(list(ext.exterior.coords)[::-1])
        A = ext.area
        hv = hsh(a['id'], pi)
        h = pheight(t.get('height'))
        lv = pheight(t.get('building:levels'))
        if h is None and lv is not None and 0 < lv < 130: h = lv * 3.3 + 0.8
        if (h is None or h <= 0 or h > 520) and bt in (0, 1, 2):
            c0 = ext.representative_point(); il = infer_levels(c0.x, c0.y, A, t.get('building'))
            if il is not None:
                jitter = [-1, 0, 0, 1][hv % 4] if il >= 8 else 0
                h = max(1, il + jitter) * 3.3 + 0.8; n_inferred += 1
        if h is None or h <= 0 or h > 520:
            r = (hv % 1000) / 1000.0
            if bt == 6: h = 3.5
            elif bt == 5: h = 7 + r * 5
            elif bt == 3: h = 7 + r * 6
            elif bt == 4: h = 13 + r * 6
            elif A < 70: h = (2 + int(r * 3)) * 3.2
            elif A < 450: h = (4 + int(r * r * 4)) * 3.2
            elif A < 1600: h = (5 + int(r * r * 9)) * 3.2
            else: h = (4 + int(r * r * 8)) * 3.4
            if bt == 2: h *= 1.35
        cen = ext.representative_point() if not ext.contains(ext.centroid) else ext.centroid
        c = cell_of(cen.x, cen.y); tl = tile_of_cell(c)
        ox, oz = tl[0] * TILE, tl[1] * TILE
        coords = list(ext.exterior.coords)[:-1]
        brec = [int(round(h * 10)), bt, flat(coords, ox, oz)]
        cells[c]['b'].append(brec); bld_recs.append((brec, coords))
        bld_geoms.append(ext); bld_info.append(dict(tags=t, id=a['id'], cen=(cen.x, cen.y), bt=bt, h=h))
        if h >= 120:
            landmarks.append(dict(n=t.get('name', ''), h=round(h, 1), pts=[round(v, 1) for xy in coords for v in xy], coords=coords))
        nb += 1
log("buildings:", nb, "heights inferred from nearby tagged buildings:", n_inferred)

# ====================================================================== 補齊街屋
# 開放地圖在很多地方沒畫建物（新北尤其少）。沿著一般道路兩側、沒有建物也不是綠地水域停車場的地方，
# 自動補上台灣常見的臨街公寓／透天厝，讓街景連續。這些是推測的，不是真實建物。
FILL = os.environ.get('FILL', '1') != '0'
ngen = 0
if FILL:
    _bt = STRtree(bld_geoms)
    _blk = []
    for a in D['areas']:
        if a['kind'] in ('green', 'water', 'parking'):
            g = proj_geom(wkb.loads(a['geom']))
            if not g.is_valid: g = g.buffer(0)
            if g.area > 30: _blk.append(g)
    _blkt = STRtree(_blk)
    _road_polys = [LineString(e['pts']).buffer(e['width'] / 2 + 0.4, cap_style=2) for e in edges if not e['tunnel']]
    _rt = STRtree(_road_polys)
    gen_grid = defaultdict(list)
    city_in = prep(city.buffer(-5))
    def gen_ok(poly):
        if not city_in.contains(poly): return False
        for i in _bt.query(poly):
            if bld_geoms[i].intersects(poly): return False
        for i in _blkt.query(poly):
            if _blk[i].intersects(poly): return False
        for i in _rt.query(poly):
            if _road_polys[i].intersects(poly): return False
        c = poly.centroid; k = (int(c.x // 60), int(c.y // 60))
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for q2 in gen_grid.get((k[0] + dx, k[1] + dz), []):
                    if q2.intersects(poly): return False
        return True
    FLOORS = {2: (5, 13), 3: (4, 11), 4: (3, 7), 5: (2, 5)}
    for ei, e in enumerate(edges):
        if e['cls'] not in (2, 3, 4, 5) or e['h'] or e['tunnel'] or e['len'] < 18: continue
        line = LineString(e['pts'])
        setback = 3.4 if e['cls'] <= 3 else 2.7
        for side in (1, -1):
            sp = e.get('trim_a', 0) + 5.0
            k = 0
            while sp < e['len'] - 5:
                k += 1
                r = hsh(ei, side, k)
                w = 5.5 + (r % 1000) / 1000 * 5.0
                d = 11 + ((r >> 10) % 1000) / 1000 * 7
                if sp + w > e['len'] - 4: break
                p0 = line.interpolate(sp); p1 = line.interpolate(sp + w)
                tx, tz = p1.x - p0.x, p1.y - p0.y; L = math.hypot(tx, tz) or 1; tx /= L; tz /= L
                rx, rz = -tz * side, tx * side      # 往外的方向（道路右側為正）
                off = e['width'] / 2 + setback
                a = (p0.x + rx * off, p0.y + rz * off); b = (p1.x + rx * off, p1.y + rz * off)
                poly = Polygon([a, b, (b[0] + rx * d, b[1] + rz * d), (a[0] + rx * d, a[1] + rz * d)])
                if not poly.is_valid or poly.area < 30:
                    sp += 3; continue
                if (r >> 20) % 100 < 12 or not gen_ok(poly):   # 偶爾留空地
                    sp += 3.5; continue
                ext = shapely.geometry.polygon.orient(poly, 1.0)
                lo, hi = FLOORS[e['cls']]
                fl = lo + int(((r >> 3) % 997) / 997 * (hi - lo + 1)) ** 1 if lo < hi else lo
                fl = min(hi, max(lo, fl))
                h = fl * 3.2 + 0.6
                bt = 2 if (e['cls'] <= 3 and (r >> 7) % 4 == 0) else 1
                cen = ext.centroid
                c = cell_of(cen.x, cen.y); tl = tile_of_cell(c); ox, oz = tl[0] * TILE, tl[1] * TILE
                coords = list(ext.exterior.coords)[:-1]
                brec = [int(round(h * 10)), bt, flat(coords, ox, oz)]
                cells[c]['b'].append(brec); bld_recs.append((brec, coords))
                bld_geoms.append(ext); bld_info.append(dict(tags={}, id=-1, cen=(cen.x, cen.y), bt=bt, h=h, gen=True))
                gen_grid[(int(cen.x // 60), int(cen.y // 60))].append(ext)
                ngen += 1
                sp += w + 0.15
log("generated street buildings:", ngen)
bld_tree = STRtree(bld_geoms)

# ====================================================================== 綠地／水域／停車場（依小格裁切）
def rings_of(poly, ox, oz):
    out = [flat(list(poly.exterior.coords)[:-1], ox, oz)]
    for h in poly.interiors:
        if Polygon(h).area > 30: out.append(flat(list(h.coords)[:-1], ox, oz))
    return out

def emit_clipped(g, key, extra=None, min_area=20.0):
    if g.is_empty: return
    minx, minz, maxx, maxz = g.bounds
    pg = prep(g)
    for cx in range(math.floor(minx / CELL), math.floor(maxx / CELL) + 1):
        for cz in range(math.floor(minz / CELL), math.floor(maxz / CELL) + 1):
            bx = box(cx * CELL, cz * CELL, (cx + 1) * CELL, (cz + 1) * CELL)
            if not pg.intersects(bx): continue
            piece = bx if pg.contains(bx) else g.intersection(bx)
            if piece.is_empty: continue
            polys = [piece] if isinstance(piece, Polygon) else [p for p in getattr(piece, 'geoms', []) if isinstance(p, Polygon)]
            tl = tile_of_cell((cx, cz)); ox, oz = tl[0] * TILE, tl[1] * TILE
            for p in polys:
                if p.area < min_area: continue
                rec = rings_of(shapely.geometry.polygon.orient(p, 1.0), ox, oz)
                cells[(cx, cz)][key].append(rec if extra is None else [extra] + rec)

city_clip = city.buffer(450)
ng = nw = npk = 0
parking_lots = []
for a in D['areas']:
    k = a['kind']
    if k in ('building', 'campus'): continue
    g = proj_geom(wkb.loads(a['geom']))
    if not g.is_valid: g = g.buffer(0)
    t = a['tags']
    if k == 'parking':
        ptype = t.get('parking', 'surface')
        if ptype in ('underground', 'multi-storey', 'rooftop') or t.get('access') in ('private', 'no'): continue
        g = g.simplify(0.4)
        polys = [g] if isinstance(g, Polygon) else list(getattr(g, 'geoms', []))
        for p in polys:
            if not isinstance(p, Polygon) or p.area < 150: continue
            cen = p.representative_point()
            c = cell_of(cen.x, cen.y); tl = tile_of_cell(c); ox, oz = tl[0] * TILE, tl[1] * TILE
            lv = T.level_in(Polygon(p.exterior)); T.flatten(Polygon(p.exterior).buffer(1.5), lv - 0.04)
            cells[c]['p'].append([len(parking_lots), flat(list(shapely.geometry.polygon.orient(Polygon(p.exterior), 1.0).exterior.coords)[:-1], ox, oz), int(round(lv * 10))])
            parking_lots.append(dict(x=cen.x, z=cen.y, area=p.area, name=t.get('name', '')))
            npk += 1
        continue
    g = g.intersection(city_clip)
    if g.is_empty: continue
    g = g.simplify(1.5 if k == 'green' else 1.2)
    if not g.is_valid: g = g.buffer(0)
    if k == 'green':
        T.mark_green(g)      # 綠地改成地形頂點顏色
        # 都市小公園：另外輸出範圍，讓遊戲畫出步道、大樹、遊具
        if t.get('leisure') in ('park', 'garden', 'playground') and 300 < g.area < 80000:
            emit_clipped(g.simplify(0.8), 'pk', extra=2 if t.get('leisure') == 'playground' else 1, min_area=60)
    else:
        lv = T.level_in(g, T.nat, q=15)
        T.lower(g, lv - 1.2)
        emit_clipped(g, 'w', extra=int(round(lv * 10)))
    if k == 'green': ng += 1
    else: nw += 1
log("green:", ng, "water:", nw, "parking lots:", npk)

# ====================================================================== POI：充電站、加油站
for n in D['nodes']:
    am = n['tags'].get('amenity')
    if am in ('charging_station', 'fuel'):
        x, z = proj(n['lon'], n['lat'])
        c = cell_of(x, z); tl = tile_of_cell(c)
        cells[c]['poi'].append([0 if am == 'charging_station' else 1, q(x, tl[0] * TILE), q(z, tl[1] * TILE)])

# ====================================================================== 住址與工作地點
# 可以停靠的一般道路（地面、非快速道路）
door_edges = [e for e in edges if e['cls'] in (2, 3, 4, 5, 6) and not e['h'] and not e['tunnel']]
door_lines = [LineString(e['pts']) for e in door_edges]
door_tree = STRtree(door_lines)

def door_for(geom, maxd=45.0):
    """回傳 (doorx, doorz, roadx, roadz, edge) —— 建物面向最近道路的門口位置。"""
    i = door_tree.nearest(geom)
    line = door_lines[i]
    d = geom.distance(line)
    if d > maxd: return None
    if isinstance(geom, Point):
        pr = line.interpolate(line.project(geom))
        return (geom.x, geom.y, pr.x, pr.y, door_edges[i])
    p_on_b, p_on_r = shapely.ops.nearest_points(geom.exterior, line)
    dx, dz = p_on_r.x - p_on_b.x, p_on_r.y - p_on_b.y
    L = math.hypot(dx, dz) or 1.0
    step = min(1.4, max(0.6, L * 0.5))
    return (p_on_b.x + dx / L * step, p_on_b.y + dz / L * step, p_on_r.x, p_on_r.y, door_edges[i])

import shapely.ops
def clean_hn(s):
    s = str(s).strip().replace('號', '')
    return s

homes = defaultdict(list)
seen_addr = set()
def add_home(geom, street, hn, approx=0):
    if not street or not hn: return
    dr = door_for(geom)
    if dr is None: return
    e = dr[4]
    if e['cls'] not in (4, 5, 6) and not approx:
        # 大馬路旁也可以住，但路邊車位由附近巷弄提供
        pass
    di = district_of(dr[0], dr[1])
    if di < 0: return
    addr = f"{street}{clean_hn(hn)}號"
    key = (di, addr)
    if key in seen_addr: return
    seen_addr.add(key)
    homes[di].append(dict(a=addr, x=round(dr[0], 1), z=round(dr[1], 1), rx=round(dr[2], 1), rz=round(dr[3], 1),
                          road=e['name'], approx=approx))

RES = {'residential', 'apartments', 'house', 'yes', 'detached', 'dormitory', 'terrace'}
for g, info in zip(bld_geoms, bld_info):
    t = info['tags']
    if t.get('building') in RES and t.get('addr:street') and t.get('addr:housenumber') \
            and not t.get('amenity') and not t.get('office') and not t.get('shop') and 30 < g.area < 2500:
        add_home(g, t['addr:street'], t['addr:housenumber'])
n_bld_addr = sum(len(v) for v in homes.values())
for n in D['nodes']:
    t = n['tags']
    # 台北有上百萬筆門牌點，抽樣約 4% 就足夠每區挑出住址
    if hsh(n['id']) % 25 != 0: continue
    if t.get('addr:street') and t.get('addr:housenumber') and not t.get('amenity') and not t.get('shop') \
            and not t.get('office') and not t.get('tourism') and not t.get('name') and not t.get('railway'):
        p = Point(proj(n['lon'], n['lat']))
        hit = [i for i in bld_tree.query(p.buffer(6)) if bld_geoms[i].distance(p) < 6]
        if hit:
            i = min(hit, key=lambda i: bld_geoms[i].distance(p))
            if bld_info[i]['bt'] in (0, 1) and 30 < bld_geoms[i].area < 2500:
                add_home(bld_geoms[i], t['addr:street'], t['addr:housenumber'])
log("homes with real OSM address:", {districts[k]['name']: len(v) for k, v in homes.items()}, "(from buildings:", n_bld_addr, ")")

# 不足的行政區：用「住宅道路旁的建物」補，門牌用路名＋（近）標示為近似
rng = random.Random(20261012)
for di in range(len(districts)):
    if len(homes[di]) >= 16: continue
    dg = districts[di]['geom']
    cand = [i for i in bld_tree.query(dg) if bld_info[i]['bt'] in (0, 1) and 60 < bld_geoms[i].area < 900]
    rng.shuffle(cand)
    added = 0
    for i in cand:
        if added >= 40: break
        dr = door_for(bld_geoms[i], 25)
        if dr is None or not dr[4]['name'] or dr[4]['cls'] not in (4, 5, 6): continue
        if district_of(dr[0], dr[1]) != di: continue
        addr = f"{dr[4]['name']}（近）"
        homes[di].append(dict(a=addr, x=round(dr[0], 1), z=round(dr[1], 1), rx=round(dr[2], 1), rz=round(dr[3], 1),
                              road=dr[4]['name'], approx=1))
        added += 1

# 每區挑最多 28 個、盡量分散
homes_out = []
for di in range(len(districts)):
    lst = homes[di]
    buckets = defaultdict(list)
    for h in lst: buckets[(int(h['x'] // 350), int(h['z'] // 350))].append(h)
    keys = sorted(buckets); rng.shuffle(keys)
    pick = []
    # 先放真實門牌
    for real in (0, 1):
        for k in keys:
            c = [h for h in buckets[k] if h['approx'] == real]
            if c and len(pick) < 28:
                h = rng.choice(c)
                if h not in pick: pick.append(h)
    homes_out.append(pick)
log("homes picked:", [len(p) for p in homes_out])

# --- 工作地點
WORK_AMENITY = dict(school='學校', university='大學', college='學院', hospital='醫院', bank='銀行', townhall='政府機關',
                    library='圖書館', police='警察局', fire_station='消防隊', post_office='郵局', courthouse='法院',
                    kindergarten='幼兒園', clinic='診所', community_centre='活動中心', marketplace='市場')
WORK_SHOP = dict(mall='百貨商場', department_store='百貨公司', supermarket='超市')
WORK_TOUR = dict(hotel='飯店', museum='博物館')
def work_kind(t):
    if t.get('amenity') in WORK_AMENITY: return WORK_AMENITY[t['amenity']]
    if t.get('shop') in WORK_SHOP: return WORK_SHOP[t['shop']]
    if t.get('tourism') in WORK_TOUR: return WORK_TOUR[t['tourism']]
    if t.get('office'): return '辦公室'
    if t.get('building') in ('office', 'commercial'): return '辦公大樓'
    if t.get('building') == 'government' or t.get('government'): return '政府機關'
    return None

works, seen_w = [], set()
def add_work(geom, t):
    name = t.get('name')
    if not name or len(name) > 28: return
    kind = work_kind(t)
    if kind is None: return
    dr = door_for(geom, 60)
    if dr is None: return
    di = district_of(dr[0], dr[1])
    if di < 0: return
    key = (name, int(dr[0] // 150), int(dr[1] // 150))
    if key in seen_w: return
    seen_w.add(key)
    works.append(dict(n=name, k=kind, x=round(dr[0], 1), z=round(dr[1], 1), d=di))

for a in D['areas']:
    if a['kind'] != 'campus': continue
    g = proj_geom(wkb.loads(a['geom']))
    if not g.is_valid: g = g.buffer(0)
    if isinstance(g, MultiPolygon): g = max(g.geoms, key=lambda p: p.area)
    if isinstance(g, Polygon) and g.area > 200: add_work(Polygon(g.exterior), a['tags'])
for g, info in zip(bld_geoms, bld_info):
    add_work(g, info['tags'])
for n in D['nodes']:
    t = n['tags']
    if 'name' not in t or work_kind(t) is None: continue
    p = Point(proj(n['lon'], n['lat']))
    hit = [i for i in bld_tree.query(p.buffer(3)) if bld_geoms[i].distance(p) < 3]
    add_work(bld_geoms[hit[0]] if hit else p, t)
# 太多的種類做抽樣（診所、銀行分行等），保留大型地點
cap = {'診所': 120, '銀行': 200, '辦公室': 700, '幼兒園': 120, '超市': 150, '飯店': 200}
bykind = defaultdict(list)
for w in works: bykind[w['k']].append(w)
works = []
for k, lst in bykind.items():
    rng.shuffle(lst)
    works += lst[:cap.get(k, 100000)]
log("workplaces:", len(works), {k: len(v) for k, v in bykind.items()})

# ====================================================================== 真實店家招牌
# 有店名的 POI → 掛在最近那棟建物、面向馬路的那一面
BRANDS = ['7-ELEVEN', '7-11', '統一超商', '全家', 'FamilyMart', '萊爾富', 'OK', '全聯', '家樂福', '麥當勞', '肯德基', '摩斯',
          '星巴克', '路易莎', '85度C', '屈臣氏', '康是美', '中華郵政', '郵局', '寶雅', '大苑子', '五十嵐', '清心', '迷客夏', '50嵐',
          '漢堡王', '必勝客', '達美樂', '頂呱呱', '八方雲集', '四海遊龍', '丹丹', '吉野家', 'Mister Donut', '台灣大哥大', '中華電信', '遠傳',
          '台灣銀行', '土地銀行', '合作金庫', '第一銀行', '華南銀行', '彰化銀行', '國泰世華', '中國信託', '玉山銀行', '台新銀行', '富邦', '永豐',
          '中油', '台塑', '燦坤', '全國電子', '大創', '無印良品', '優衣庫', 'UNIQLO', 'NET', '日藥本舖', '大樹藥局', '杏一', '丁丁藥局']
def sign_cat(t):
    am, sh, of = t.get('amenity'), t.get('shop'), t.get('office')
    if sh in ('convenience',): return 0
    if am in ('restaurant', 'fast_food', 'food_court'): return 1
    if am in ('cafe', 'ice_cream') or sh in ('beverages', 'tea', 'coffee', 'bakery', 'pastry', 'confectionery'): return 2
    if am in ('bank', 'atm', 'bureau_de_change'): return 3
    if am in ('pharmacy', 'clinic', 'dentist', 'doctors', 'hospital', 'veterinary') or sh in ('chemist', 'medical_supply', 'optician'): return 4
    if sh in ('supermarket', 'department_store', 'mall'): return 8
    if am == 'fuel': return 9
    if am in ('school', 'kindergarten', 'college', 'language_school', 'music_school', 'driving_school'): return 10
    if t.get('tourism') in ('hotel', 'hostel', 'guest_house', 'motel'): return 7
    if of: return 6
    if sh: return 5
    if am in ('bar', 'pub', 'karaoke_box', 'cinema', 'post_office', 'internet_cafe', 'car_wash', 'car_rental'): return 5
    return None
def brand_of(t):
    nm = (t.get('brand') or '') + ' ' + (t.get('name') or '')
    for i, b in enumerate(BRANDS):
        if b.lower() in nm.lower(): return i
    return -1
nsign = 0
sign_seen = set()
for n in D['nodes']:
    t = n['tags']; name = t.get('name')
    if not name or len(name) > 18: continue
    cat = sign_cat(t)
    if cat is None: continue
    p = Point(proj(n['lon'], n['lat']))
    hit = [i for i in bld_tree.query(p.buffer(18)) if bld_geoms[i].distance(p) < 18]
    if not hit: continue
    bi = min(hit, key=lambda i: bld_geoms[i].distance(p))
    g = bld_geoms[bi]
    di = door_tree.nearest(g); line = door_lines[di]
    if g.distance(line) > 40: continue
    pb, pr = shapely.ops.nearest_points(g.exterior, line)
    dx, dz = pr.x - pb.x, pr.y - pb.y; L = math.hypot(dx, dz)
    if L < 0.3: continue
    key = (name, round(pb.x / 4), round(pb.y / 4))
    if key in sign_seen: continue
    sign_seen.add(key)
    # 同一面牆上已經有招牌就往旁邊挪一點（沿牆方向）
    c = cell_of(pb.x, pb.y); tl = tile_of_cell(c)
    cells[c].setdefault('s', []).append([name_idx(tl, name), cat, brand_of(t), q(pb.x, tl[0] * TILE), q(pb.y, tl[1] * TILE),
                                         int(round(dx / L * 100)), int(round(dz / L * 100)),
                                         int(round(float(T.sample(T.fin, [pb.x], [pb.y])[0]) * 10)), int(round(bld_info[bi]['h'] * 10))])
    nsign += 1
log("real shop signs:", nsign)

# ====================================================================== 小遊戲任務
mission = None
if MISSION:
    sx, sz = proj(*MISSION['start']); dx_, dz_ = proj(*MISSION['dest'])
    st = door_for(Point(sx, sz), 300); de = door_for(Point(dx_, dz_), 300)
    mission = dict(
        start=dict(x=round(st[2], 1), z=round(st[3], 1), name=MISSION.get('startName', '起點')),
        dest=dict(x=round(dx_, 1), z=round(dz_, 1), rx=round(de[2], 1), rz=round(de[3], 1), name=MISSION.get('destName', '終點')),
        routes={k: [round(v, 1) for lon, lat in r[::3] for v in proj(lon, lat)] for k, r in MISSION['routes'].items()},
    )
    log("mission:", mission['start'], mission['dest'])

# ====================================================================== 建物基準高度與地形輸出
for brec, coords in bld_recs:
    xs = [p[0] for p in coords]; zs = [p[1] for p in coords]
    brec.append(int(round((float(T.sample(T.fin, xs, zs).min()) - 0.3) * 10)))
# 臨街的牆：牆面外側 6 m 內有道路 → [4] 位元遮罩（前 30 面牆）、[5] 最近道路等級
_rl = [(LineString(e['pts']), e['cls']) for e in edges if not e['h'] and not e['tunnel']]
_rtree = STRtree([l for l, _ in _rl]); _rcls = np.array([c for _, c in _rl])
probes, owners = [], []
for bi, (brec, coords) in enumerate(bld_recs):
    n = len(coords)
    for i in range(min(n, 30)):
        a, b = coords[i], coords[(i + 1) % n]
        dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz)
        if L < 2.5: continue
        probes.append(Point((a[0] + b[0]) / 2 + dz / L * 5.5, (a[1] + b[1]) / 2 - dx / L * 5.5)); owners.append((bi, i))
pairs = _rtree.query(probes, predicate='dwithin', distance=5.5)
mask = [0] * len(bld_recs); mcls = [9] * len(bld_recs)
for pi, ri in zip(pairs[0], pairs[1]):
    bi, wi = owners[pi]
    mask[bi] |= 1 << wi; mcls[bi] = min(mcls[bi], int(_rcls[ri]))
for bi, (brec, coords) in enumerate(bld_recs):
    brec.append(mask[bi]); brec.append(mcls[bi])
for (brec, coords), info in zip(bld_recs, bld_info):
    brec.append(1 if info.get('gen') else 0)
log("street-facing buildings:", sum(1 for m in mask if m))
for lm in landmarks:
    xs = [p[0] for p in lm['coords']]; zs = [p[1] for p in lm['coords']]
    lm['base'] = round(float(T.sample(T.fin, xs, zs).min()) - 0.3, 1); del lm['coords']
tclip = city.buffer(700)
ptc = prep(tclip)
bx0, bz0, bx1, bz1 = tclip.bounds
nterr = 0
for cx in range(math.floor(bx0 / CELL), math.floor(bx1 / CELL) + 1):
    for cz in range(math.floor(bz0 / CELL), math.floor(bz1 / CELL) + 1):
        if not ptc.intersects(box(cx * CELL, cz * CELL, (cx + 1) * CELL, (cz + 1) * CELL)): continue
        tg = T.cell_grid(cx, cz)
        if tg is None: continue
        cells[(cx, cz)]['t'] = [tg[0], tg[1], tg[2]] if tg[2] else [tg[0], tg[1]]
        nterr += 1
log("terrain cells:", nterr)

# ====================================================================== 寫檔
tiles = defaultdict(dict)
for c, data in cells.items():
    if not any(data.values()): continue
    tiles[tile_of_cell(c)][f"{c[0]},{c[1]}"] = {k: v for k, v in data.items() if v}
tile_index = []
total = 0
for t, cs in sorted(tiles.items()):
    names = [None] * len(names_by_tile[t])
    for nm, i in names_by_tile[t].items(): names[i] = nm
    obj = dict(tx=t[0], tz=t[1], names=names, cells=cs)
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    fn = f"t_{t[0]}_{t[1]}.json"
    with open(os.path.join(OUT, fn), 'w', encoding='utf-8') as f: f.write(s)
    b = len(s.encode('utf-8')); total += b
    tile_index.append([t[0], t[1], b])
log("tiles:", len(tile_index), "total MB: %.1f" % (total / 1e6), "max MB: %.2f" % (max(t[2] for t in tile_index) / 1e6))

def simp_ring(g, tol):
    g = g.simplify(tol)
    polys = [g] if isinstance(g, Polygon) else sorted(g.geoms, key=lambda p: -p.area)
    return [[round(v) for xy in list(p.exterior.coords)[:-1] for v in xy] for p in polys if p.area > 5000]

minx, minz, maxx, maxz = city.bounds
meta = dict(
    version=1,
    attribution="地圖資料 © OpenStreetMap contributors (ODbL)；地形：內政部 20 公尺網格數值地形模型（政府資料開放授權條款第1版）",
    terrain=dict(step=10, n=51),
    proj=dict(lon0=LON0, lat0=LAT0, mlon=MLON, mlat=MLAT),
    cell=CELL, tileCells=TILE_CELLS,
    bounds=[round(minx), round(minz), round(maxx), round(maxz)],
    city=simp_ring(city, 25),
    tiles=tile_index,
    districts=[dict(name=d['name'], en=d['en'], poly=simp_ring(d['geom'], 18),
                    c=[round(d['geom'].representative_point().x), round(d['geom'].representative_point().y)])
               for d in districts],
    homes=homes_out,
    mission=mission,
    landmarks=landmarks,
    works=works,
    stats=dict(edges=len(edges), nodes=N, road_km=round(sum(e['len'] for e in edges) / 1000),
               buildings=nb, signals=len(signals), parking_lots=npk, tiles=len(tile_index), bytes=total),
)
with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))

# 全市路網（導航用）：nodes [x,z,...] (m, 0.1 精度)，edges [a,b,len(m),cls,oneway,speed,...]
nav = dict(nodes=[round(v, 1) for xy in node_xy for v in xy],
           edges=[v for e in edges for v in (e['a'], e['b'], round(e['len'], 1), e['cls'], e['oneway'], e['speed'])])
with open(os.path.join(OUT, 'nav.json'), 'w') as f:
    json.dump(nav, f, separators=(',', ':'))
log("meta.json %.2f MB, nav.json %.2f MB" % (os.path.getsize(os.path.join(OUT, 'meta.json')) / 1e6,
                                             os.path.getsize(os.path.join(OUT, 'nav.json')) / 1e6))
log("stats:", meta['stats'])
