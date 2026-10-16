#!/usr/bin/env python3
"""Stage 1 — 從 OSM PBF 抽出台北市範圍內的原始圖資，存成 pickle 供 build_tiles.py 使用。

用法: python3 tools/extract_osm.py <taiwan-latest.osm.pbf> <out.pkl>

抽出內容：
  - 行政區界（臺北市與 12 個行政區）
  - 道路（highway=*，可行駛等級）
  - 面狀圖徵：建物、綠地、水域、停車場
  - 點狀圖徵：門牌、號誌、停車場／充電站／加油站、可當工作地點的 POI
"""
import sys, pickle, time
import osmium
from shapely import wkb
from shapely.geometry import Point, box
from shapely.prepared import prep
from shapely.ops import unary_union

SRC, OUT = sys.argv[1], sys.argv[2]
# 第 3 個參數（可省略）：範圍多邊形 WKT（經緯度）。省略時用臺北市界。
REGION = None
if len(sys.argv) > 3:
    from shapely import wkt as _wkt
    REGION = _wkt.loads(open(sys.argv[3]).read())
T0 = time.time()
def log(*a): print(f"[{time.time()-T0:6.1f}s]", *a, flush=True)

# 大略範圍（先用 bbox 快篩，再用市界精篩）
BB = (121.43, 24.94, 121.68, 25.23)  # lon0, lat0, lon1, lat1
if REGION is not None:
    _b = REGION.bounds; BB = (_b[0] - 0.01, _b[1] - 0.01, _b[2] + 0.01, _b[3] + 0.01)
def in_bb(lon, lat): return BB[0] <= lon <= BB[2] and BB[1] <= lat <= BB[3]

wkbf = osmium.geom.WKBFactory()

# ---------------------------------------------------------------- 行政區界
log("pass A: boundaries")
bounds = []
fp = (osmium.FileProcessor(SRC).with_areas()
      .with_filter(osmium.filter.EntityFilter(osmium.osm.AREA))
      .with_filter(osmium.filter.TagFilter(('boundary', 'administrative'))))
for o in fp:
    lvl = o.tags.get('admin_level')
    if lvl not in ('4', '5', '6', '7', '8'):
        continue
    try:
        g = wkb.loads(wkbf.create_multipolygon(o), hex=True)
    except Exception:
        continue
    c = g.representative_point()
    if REGION is not None:
        if lvl in ('5', '6', '7') and g.intersects(REGION):
            bounds.append(dict(level=lvl, name=o.tags.get('name'), name_en=o.tags.get('name:en'),
                               wikidata=o.tags.get('wikidata'), geom=g.wkb))
        continue
    if not in_bb(c.x, c.y):
        # 市界本身的代表點一定在 bbox 內；其他縣市略過
        continue
    bounds.append(dict(level=lvl, name=o.tags.get('name'), name_en=o.tags.get('name:en'),
                       wikidata=o.tags.get('wikidata'), geom=g.wkb))
log("  boundaries in bbox:", len(bounds))

city = REGION
for b in (bounds if REGION is None else []):
    if b['level'] == '4' and (b['wikidata'] == 'Q1867' or b['name'] in ('臺北市', '台北市')):
        city = wkb.loads(b['geom'])
assert city is not None, "找不到臺北市界"
log("  city area deg2:", city.area)
# 0.004 度 ≈ 400 m 緩衝，讓跨市界的橋與道路不會被硬切
city_buf = city.buffer(0.004)
pcity = prep(city_buf)
pcity_strict = prep(city)
cminx, cminy, cmaxx, cmaxy = city_buf.bounds
def in_city_bb(lon, lat): return cminx <= lon <= cmaxx and cminy <= lat <= cmaxy

districts = []
for b in bounds:
    if b['level'] in ('5', '6', '7'):
        g = wkb.loads(b['geom'])
        if (REGION is not None and g.intersects(city)) or (REGION is None and pcity_strict.contains(g.representative_point()) and g.area < city.area * 0.6):
            districts.append(b)
log("  districts:", [(d['name'], d['level']) for d in districts])

# ---------------------------------------------------------------- 道路
log("pass B: roads")
DRIVE = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
         'living_street', 'service', 'motorway_link', 'trunk_link', 'primary_link',
         'secondary_link', 'tertiary_link'}
ROAD_TAGS = ('highway', 'name', 'name:en', 'ref', 'oneway', 'lanes', 'maxspeed', 'bridge', 'tunnel',
             'layer', 'service', 'access', 'motor_vehicle', 'motorcar', 'junction', 'area',
             'lanes:forward', 'lanes:backward', 'covered')
roads = []
fp = (osmium.FileProcessor(SRC).with_locations()
      .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
      .with_filter(osmium.filter.KeyFilter('highway')))
for w in fp:
    hw = w.tags.get('highway')
    if hw not in DRIVE:
        continue
    pts, ids, ok = [], [], False
    for n in w.nodes:
        if not n.location.valid():
            continue
        lon, lat = n.lon, n.lat
        pts.append((lon, lat)); ids.append(n.ref)
        if not ok and in_city_bb(lon, lat):
            ok = True
    if not ok or len(pts) < 2:
        continue
    if not any(pcity.contains(Point(p)) for p in pts[::max(1, len(pts)//6)] + [pts[-1]]):
        continue
    roads.append(dict(id=w.id, tags={k: w.tags[k] for k in ROAD_TAGS if k in w.tags}, pts=pts, nodes=ids))
log("  roads:", len(roads))

# ---------------------------------------------------------------- 面狀圖徵
log("pass C: areas")
AREA_TAGS = ('building', 'building:levels', 'height', 'name', 'amenity', 'leisure', 'landuse', 'natural',
             'waterway', 'water', 'parking', 'access', 'fee', 'capacity', 'addr:street', 'addr:housenumber',
             'addr:district', 'office', 'shop', 'tourism', 'layer', 'location', 'building:part', 'man_made',
             'railway', 'public_transport', 'operator', 'government', 'healthcare')
areas = []
fp = (osmium.FileProcessor(SRC).with_areas()
      .with_filter(osmium.filter.EntityFilter(osmium.osm.AREA))
      .with_filter(osmium.filter.KeyFilter('building', 'leisure', 'landuse', 'natural', 'waterway', 'amenity')))
nseen = 0
for o in fp:
    nseen += 1
    t = o.tags
    kind = None
    if 'building' in t and t['building'] != 'no':
        kind = 'building'
    elif t.get('amenity') == 'parking':
        kind = 'parking'
    elif t.get('natural') == 'water' or t.get('waterway') in ('riverbank', 'dock') or t.get('landuse') in ('reservoir', 'basin'):
        kind = 'water'
    elif t.get('leisure') in ('park', 'garden', 'pitch', 'playground', 'golf_course', 'nature_reserve', 'dog_park') \
            or t.get('landuse') in ('grass', 'forest', 'meadow', 'recreation_ground', 'village_green', 'cemetery',
                                    'farmland', 'orchard', 'greenfield', 'allotments', 'flowerbed') \
            or t.get('natural') in ('wood', 'scrub', 'grassland', 'heath', 'wetland'):
        kind = 'green'
    if kind is None and 'name' in t and t.get('amenity') in ('school', 'university', 'college', 'hospital', 'kindergarten',
                                                             'townhall', 'library', 'courthouse', 'marketplace'):
        kind = 'campus'   # 校園、院區等有名字的範圍（當作工作地點）
    if kind is None:
        continue
    hit = False
    for ring in o.outer_rings():
        for n in ring:
            if n.location.valid() and in_city_bb(n.lon, n.lat):
                hit = True
                break
            if kind == 'building':
                break  # 建物很小，只看第一個點
        if hit or kind == 'building':
            break
    if not hit:
        continue
    try:
        g = wkb.loads(wkbf.create_multipolygon(o), hex=True)
    except Exception:
        continue
    if not g.intersects(city_buf):
        continue
    areas.append(dict(kind=kind, id=o.orig_id(), from_way=o.from_way(),
                      tags={k: t[k] for k in AREA_TAGS if k in t}, geom=g.wkb))
log("  areas seen:", nseen, "kept:", len(areas))

# ---------------------------------------------------------------- 點狀圖徵
log("pass D: nodes")
NODE_TAGS = ('name', 'name:en', 'amenity', 'office', 'shop', 'tourism', 'highway', 'addr:street', 'addr:housenumber',
             'addr:district', 'addr:city', 'addr:full', 'parking', 'capacity', 'operator', 'brand', 'government',
             'healthcare', 'railway', 'station', 'crossing', 'traffic_signals', 'socket:type2', 'access', 'fee')
nodes = []
fp = (osmium.FileProcessor(SRC)
      .with_filter(osmium.filter.EntityFilter(osmium.osm.NODE))
      .with_filter(osmium.filter.KeyFilter('addr:housenumber', 'highway', 'amenity', 'office', 'shop', 'tourism', 'railway')))
for n in fp:
    if not n.location.valid():
        continue
    lon, lat = n.lon, n.lat
    if not in_city_bb(lon, lat):
        continue
    t = n.tags
    hw = t.get('highway')
    if hw is not None and hw != 'traffic_signals' and 'addr:housenumber' not in t and 'amenity' not in t:
        continue
    if not pcity.contains(Point(lon, lat)):
        continue
    nodes.append(dict(id=n.id, lon=lon, lat=lat, tags={k: t[k] for k in NODE_TAGS if k in t}))
log("  nodes:", len(nodes))

with open(OUT, 'wb') as f:
    pickle.dump(dict(city=city.wkb, districts=districts, roads=roads, areas=areas, nodes=nodes), f, protocol=4)
log("done ->", OUT)
