"""地形：讀內政部 20 m DEM，重新取樣成遊戲座標的 10 m 網格，並把道路、停車場、水域整平。

DEM 來源：內政部「全臺灣20公尺網格數值地形模型DTM資料」（政府資料開放授權條款第1版）
檔案格式：分幅 .grd 文字檔，每行「E N H」，坐標系 TWD97 TM2 (EPSG:3826)。
"""
import glob, os, zipfile, io, math
import numpy as np
from pyproj import Transformer
from scipy import ndimage
import shapely
from shapely.geometry import Polygon, MultiPolygon

STEP = 10.0          # 遊戲用地形網格間距 (m)


def load_dem(path):
    """path 可以是 zip 檔或解壓後的資料夾。回傳 (dem[N,E], e0, n_top, res)。"""
    chunks = []
    for path in str(path).split(','):   # 可以用逗號串接多個縣市的 DEM
        if path.endswith('.zip'):
            z = zipfile.ZipFile(path)
            for n in z.namelist():
                if n.lower().endswith('.grd'):
                    chunks.append(np.loadtxt(io.TextIOWrapper(z.open(n), encoding='latin-1')))
        else:
            for f in glob.glob(os.path.join(path, '*.grd')):
                chunks.append(np.loadtxt(f))
    a = np.concatenate(chunks)
    E, N, H = a[:, 0], a[:, 1], a[:, 2]
    res = 20.0
    e0, n0 = E.min(), N.min()
    ne, nn = int(round((E.max() - e0) / res)) + 1, int(round((N.max() - n0) / res)) + 1
    dem = np.full((nn, ne), np.nan, dtype=np.float32)
    dem[np.round((N - n0) / res).astype(int), np.round((E - e0) / res).astype(int)] = H
    # 缺值用最近的有效值補
    mask = np.isnan(dem)
    if mask.any():
        idx = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
        dem = dem[tuple(idx)]
    return dem, e0, n0, res


class Terrain:
    def __init__(self, dem_path, bounds, lon0, lat0, mlon, mlat, cell=500.0):
        dem, e0, n0, res = load_dem(dem_path)
        x0, z0, x1, z1 = bounds
        self.gx0 = math.floor(x0 / cell) * cell
        self.gz0 = math.floor(z0 / cell) * cell
        nx = int(math.ceil((x1 - self.gx0) / cell) * cell / STEP) + 1
        nz = int(math.ceil((z1 - self.gz0) / cell) * cell / STEP) + 1
        xs = self.gx0 + np.arange(nx) * STEP
        zs = self.gz0 + np.arange(nz) * STEP
        X, Z = np.meshgrid(xs, zs)
        lon = lon0 + X / mlon
        lat = lat0 - Z / mlat
        tr = Transformer.from_crs('EPSG:4326', 'EPSG:3826', always_xy=True)
        E, N = tr.transform(lon, lat)
        nat = ndimage.map_coordinates(dem, [(N - n0) / res, (E - e0) / res], order=1, mode='nearest')
        self.nat = nat.astype(np.float32)                       # 原始地形
        self.s20 = ndimage.gaussian_filter(self.nat, 2.0)       # 道路用（平滑 ~20 m）
        self.s80 = ndimage.gaussian_filter(self.nat, 8.0)       # 高架橋基準（平滑 ~80 m）
        self.fin = self.nat.copy()                              # 整平後、實際畫出的地形
        self.green = np.zeros(self.nat.shape, dtype=np.uint8)
        self.hole = np.zeros(self.nat.shape, dtype=np.uint8)   # 地下道引道開口：這些網格點周圍不畫地形
        self.nx, self.nz = nx, nz
        self.cell = cell

    # ------------------------------------------------------------------ 取樣
    def sample(self, grid, x, z):
        x = np.asarray(x, dtype=np.float64); z = np.asarray(z, dtype=np.float64)
        return ndimage.map_coordinates(grid, [(z - self.gz0) / STEP, (x - self.gx0) / STEP], order=1, mode='nearest')

    def _box(self, minx, minz, maxx, maxz):
        i0 = max(0, int(math.floor((minx - self.gx0) / STEP))); i1 = min(self.nx - 1, int(math.ceil((maxx - self.gx0) / STEP)))
        j0 = max(0, int(math.floor((minz - self.gz0) / STEP))); j1 = min(self.nz - 1, int(math.ceil((maxz - self.gz0) / STEP)))
        return i0, i1, j0, j1

    def _inside(self, geom):
        """回傳 geom 內部的網格點 (j, i) 索引陣列。"""
        i0, i1, j0, j1 = self._box(*geom.bounds)
        if i1 < i0 or j1 < j0: return None
        ii, jj = np.meshgrid(np.arange(i0, i1 + 1), np.arange(j0, j1 + 1))
        xs = self.gx0 + ii * STEP; zs = self.gz0 + jj * STEP
        m = shapely.contains_xy(geom, xs, zs)
        if not m.any(): return None
        return jj[m], ii[m]

    # ------------------------------------------------------------------ 整平
    def carve_roads(self, segs, flat=3.6, blend=7.0):
        """segs: 迭代 (x0, z0, h0, x1, z1, h1, halfwidth)。道路兩側 flat 公尺內完全整平，再用 blend 公尺過渡到原地形。"""
        best = np.full(self.nat.shape, np.inf, dtype=np.float32)
        bh = np.zeros(self.nat.shape, dtype=np.float32)
        reach = flat + blend
        for x0, z0, h0, x1, z1, h1, hw in segs:
            r = hw + reach
            i0, i1, j0, j1 = self._box(min(x0, x1) - r, min(z0, z1) - r, max(x0, x1) + r, max(z0, z1) + r)
            if i1 < i0 or j1 < j0: continue
            xs = self.gx0 + np.arange(i0, i1 + 1) * STEP
            zs = self.gz0 + np.arange(j0, j1 + 1) * STEP
            X, Z = np.meshgrid(xs, zs)
            dx, dz = x1 - x0, z1 - z0
            L2 = dx * dx + dz * dz or 1e-6
            t = np.clip(((X - x0) * dx + (Z - z0) * dz) / L2, 0, 1)
            d = np.hypot(X - (x0 + dx * t), Z - (z0 + dz * t)) - hw
            sub = best[j0:j1 + 1, i0:i1 + 1]
            m = d < sub
            sub[m] = d[m]
            bh[j0:j1 + 1, i0:i1 + 1][m] = (h0 + (h1 - h0) * t)[m]
        w = np.clip((best - flat) / blend, 0, 1)
        touched = best < reach
        self.fin[touched] = ((1 - w) * (bh - 0.08) + w * self.fin)[touched]
        return int(touched.sum())

    def mark_holes(self, segs, extra=1.0):
        """把線段 (x0,z0,x1,z1,halfwidth) 周圍 halfwidth+extra 內的網格點標成開口。"""
        n = 0
        for x0, z0, x1, z1, hw in segs:
            r = hw + extra
            i0, i1, j0, j1 = self._box(min(x0, x1) - r, min(z0, z1) - r, max(x0, x1) + r, max(z0, z1) + r)
            if i1 < i0 or j1 < j0: continue
            X, Z = np.meshgrid(self.gx0 + np.arange(i0, i1 + 1) * STEP, self.gz0 + np.arange(j0, j1 + 1) * STEP)
            dx, dz = x1 - x0, z1 - z0
            L2 = dx * dx + dz * dz or 1e-6
            t = np.clip(((X - x0) * dx + (Z - z0) * dz) / L2, 0, 1)
            m = np.hypot(X - (x0 + dx * t), Z - (z0 + dz * t)) < r
            self.hole[j0:j1 + 1, i0:i1 + 1][m] = 1
            n += int(m.sum())
        return n

    def flatten(self, geom, level):
        ij = self._inside(geom)
        if ij is not None: self.fin[ij] = level

    def lower(self, geom, level):
        ij = self._inside(geom)
        if ij is not None: self.fin[ij] = np.minimum(self.fin[ij], level)

    def level_in(self, geom, grid=None, q=None):
        ij = self._inside(geom)
        g = self.fin if grid is None else grid
        if ij is None:
            c = geom.representative_point()
            return float(self.sample(g, [c.x], [c.y])[0])
        v = g[ij]
        return float(np.percentile(v, q)) if q is not None else float(v.mean())

    def mark_green(self, geom):
        ij = self._inside(geom)
        if ij is not None: self.green[ij] = 1

    # ------------------------------------------------------------------ 輸出
    def cell_grid(self, cx, cz):
        """小格 (cx,cz) 的 51x51 高度 (dm, 列優先、差分編碼) 與綠地字串。"""
        n = int(self.cell / STEP) + 1
        i0 = int(round((cx * self.cell - self.gx0) / STEP)); j0 = int(round((cz * self.cell - self.gz0) / STEP))
        if i0 < 0 or j0 < 0 or i0 + n > self.nx or j0 + n > self.nz: return None
        h = np.round(self.fin[j0:j0 + n, i0:i0 + n] * 10).astype(np.int64).ravel()
        d = np.diff(h, prepend=0)
        g = self.green[j0:j0 + n, i0:i0 + n].ravel()
        o = self.hole[j0:j0 + n, i0:i0 + n].ravel()
        return (d.tolist(), ''.join('1' if v else '0' for v in g) if g.any() else '',
                ''.join('1' if v else '0' for v in o) if o.any() else '')
