#!/usr/bin/env python3
"""把影片、實測結果、可以玩的遊戲組成一個 artifact（build/art/）。不碰 git。"""
import json, os, shutil, subprocess, statistics, html
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
B = os.path.join(ROOT, 'build'); OUT = os.path.join(B, 'art'); WEB = os.path.join(ROOT, 'web')
os.makedirs(os.path.join(OUT, 'clips'), exist_ok=True)

# ------------------------------------------------------------------ 影片
CLIPS = [
    # key, 標題, 按鍵, 說明, 封面格（第幾格）
    ('boost', '推進器', 'Shift', '約 1 秒從 0 加速到 100 km/h。車尾 2 個噴嘴往後噴壓縮空氣，白霧就是噴出來的空氣。', 60),
    ('hop', '停著飛越車陣', 'F', '塞車停著也能飛：車底 4 個噴嘴往下噴、垂直升空，往前飛約 60～75 m，越過前面 10 台車再落地。', 70),
    ('flip', '空中翻轉', 'T', '飛越途中翻一圈，左右兩側噴嘴輪流噴。落地前要轉正，太晚翻會翻車，要付修車費。', 70),
    ('wall', '開上大樓外牆', 'G', '面向大樓按 G，吸住外牆垂直往上開到屋頂；在屋頂開一段，從另一邊開出去，落地前車底噴氣減速。', 140),
    ('under', '高架橋底倒著開', 'G', '在高架橋正下方按 G，翻上去吸在橋底倒著開（市民大道高架）。再按 G，翻正落地。', 120),
    ('empty', '壓縮空氣用完', '', '空氣用完，飛越、翻轉、吸附、推進器都不能用。開車時會慢慢補，回家或停在電動車充電格補得快（遊戲設定）。', 40),
]
def encode(name, frames_dir, crf=27):
    out = os.path.join(OUT, 'clips', name + '.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '24', '-i', os.path.join(frames_dir, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                    '-crf', str(crf), '-preset', 'slow', '-movflags', '+faststart', out], check=True)
    return out
def poster(name, frames_dir, idx):
    fs = sorted(os.listdir(frames_dir)); idx = min(idx, len(fs) - 1)
    out = os.path.join(OUT, 'clips', name + '.jpg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(frames_dir, fs[idx]), '-q:v', '5', out], check=True)
def dur(frames_dir): return len(os.listdir(frames_dir)) / 24
clip_info = {}
for key, *_ in CLIPS + [('drone',), ('mode_allfly',), ('mode_alldrone',)]:
    fd = os.path.join(B, 'frames', key)
    if not os.path.isdir(fd) or not os.listdir(fd): print('missing clip', key); continue
    encode(key, fd)
    pidx = {c[0]: c[4] for c in CLIPS}.get(key, {'drone': 150, 'mode_allfly': 120, 'mode_alldrone': 100}.get(key, 50))
    poster(key, fd, pidx)
    clip_info[key] = {'sec': dur(fd), 'mb': os.path.getsize(os.path.join(OUT, 'clips', key + '.mp4')) / 1e6}
print('clips', {k: (round(v['sec'], 1), round(v['mb'], 1)) for k, v in clip_info.items()})

# ------------------------------------------------------------------ 實測
m2 = json.load(open(os.path.join(B, 'measure2.json')))
m3 = json.load(open(os.path.join(B, 'measure3.json')))
def get(rows, pair, mode):
    for r in rows:
        if r.get('pair') == pair and r.get('mode') == mode and r.get('ok') and r.get('min'): return r
    return None
pairs = []
for p in sorted({r['pair'] for r in m3}):
    row = {'pair': p}
    for k, rows, mode in [('gas', m2, 'gas'), ('roadster', m2, 'roadster'), ('drone', m2, 'drone'), ('A', m3, 'A-roadster'), ('Bd', m3, 'B-drive'), ('Bf', m3, 'B-fly')]:
        r = get(rows, p, mode); row[k] = r['min'] if r else None
        if r: row.setdefault('info', r); row[k + '_r'] = r
    if row.get('info'): pairs.append(row)
KEYS = ['gas', 'roadster', 'drone', 'A', 'Bd', 'Bf']
med = {k: statistics.median([r[k] for r in pairs if r[k] is not None]) for k in KEYS if any(r[k] is not None for r in pairs)}
cnt = {k: sum(1 for r in pairs if r[k] is not None) for k in KEYS}
A_rows = [r['A_r'] for r in pairs if r.get('A_r')]
Bf_rows = [r['Bf_r'] for r in pairs if r.get('Bf_r')]
stats = {
    'A_crash_rate': statistics.median([x['cityCrashes'] / max(1, x['cityHops']) for x in A_rows]) if A_rows else 0,
    'A_wrecked': sum(1 for x in A_rows if x.get('wrecked')), 'A_n': len(A_rows),
    'A_stop': statistics.median([x['stoppedMin'] for x in A_rows]) if A_rows else 0,
    'sky_min': min(x['sky'] for x in Bf_rows) if Bf_rows else 0, 'sky_max': max(x['sky'] for x in Bf_rows) if Bf_rows else 0,
    'Bf_jam': statistics.median([x['jamMin'] for x in Bf_rows]) if Bf_rows else 0,
    'Bf_wait': statistics.median([x['liftWaitMin'] + x['crossWaitMin'] + x['waitMin'] for x in Bf_rows]) if Bf_rows else 0,
    'Bf_cost': statistics.median([x['cost'] for x in Bf_rows]) if Bf_rows else 0,
}
print('medians', med, cnt, stats)
json.dump({'pairs': [{k: v for k, v in r.items() if not k.endswith('_r') and k != 'info'} | {'district': r['info']['district'], 'home': r['info']['home'], 'work': r['info']['work'], 'km': r['info']['straightKm']} for r in pairs], 'median': med, 'stats': stats, 'clips': clip_info},
          open(os.path.join(B, 'art_data.json'), 'w'), ensure_ascii=False, indent=1)

# ------------------------------------------------------------------ 遊戲（可以玩的版本）
G = os.path.join(OUT, 'game')
if os.path.isdir(G): shutil.rmtree(G)
os.makedirs(os.path.join(G, 'js')); os.makedirs(os.path.join(G, 'models'))
shutil.copy(os.path.join(WEB, 'index.html'), os.path.join(G, 'index.html'))
for f in os.listdir(os.path.join(WEB, 'js')):
    if f.endswith('.js') and f != 'main_yingge.js': shutil.copy(os.path.join(WEB, 'js', f), os.path.join(G, 'js', f))
shutil.copytree(os.path.join(WEB, 'lib'), os.path.join(G, 'lib'))
shutil.copytree(os.path.join(WEB, 'data'), os.path.join(G, 'data'))
shutil.copy(os.path.join(WEB, 'models', 'hero.json'), os.path.join(G, 'models', 'hero.json'))

# ------------------------------------------------------------------ 頁面
E = html.escape
def fm(v): return '—' if v is None else f'{v:.0f}'
LABEL = {'gas': ('一般世界', '油車（跟著車流）'), 'roadster': ('一般世界', '飛天跑車（塞住飛越）'), 'drone': ('一般世界', '無人機系統'),
         'A': ('全城飛天跑車', '你的飛天跑車'), 'Bd': ('全城無人機', '在空的路上開'), 'Bf': ('全城無人機', '你也飛')}
CLS = {'gas': 'base', 'roadster': 'base', 'drone': 'base', 'A': 'a', 'Bd': 'b', 'Bf': 'b'}
vmax = max(med.values())
bars = '\n'.join(
    f'<div class="bar {CLS[k]}"><div class="bl"><span class="w">{E(LABEL[k][0])}</span><b>{E(LABEL[k][1])}</b></div>'
    f'<div class="bt"><i style="width:{med[k] / vmax * 100:.1f}%"></i></div><div class="bv"><b>{med[k]:.0f}</b> 分</div></div>'
    for k in KEYS if k in med)
rows = '\n'.join(
    f'<tr><td><b>{E(r["info"]["district"])}</b><span>{E(r["info"]["home"])} → {E(r["info"]["work"])}</span></td><td class="n">{r["info"]["straightKm"]:.1f}</td>'
    + ''.join(f'<td class="n {CLS[k]}">{fm(r[k])}</td>' for k in KEYS) + '</tr>' for r in pairs)
def card(key, title, keyname, desc, _):
    if key not in clip_info: return ''
    kb = f'<kbd>{E(keyname)}</kbd>' if keyname else '<kbd class="off">空</kbd>'
    return (f'<figure class="clip" id="c-{key}"><video src="clips/{key}.mp4" poster="clips/{key}.jpg" controls muted loop playsinline preload="none"></video>'
            f'<figcaption><div class="ct">{kb}<h3>{E(title)}</h3><span class="len">{clip_info[key]["sec"]:.0f} 秒</span></div><p>{E(desc)}</p></figcaption></figure>')
cards = '\n'.join(card(*c) for c in CLIPS)
dr = json.load(open(os.path.join(B, 'clip_drone.json'))) if os.path.exists(os.path.join(B, 'clip_drone.json')) else None
s = stats
page = open(os.path.join(ROOT, 'tools', 'art_template.html'), encoding='utf-8').read()
rep = {
    '{{CARDS}}': cards, '{{BARS}}': bars, '{{ROWS}}': rows, '{{NPAIRS}}': str(len(pairs)),
    '{{MED_GAS}}': fm(med.get('gas')), '{{MED_RD}}': fm(med.get('roadster')), '{{MED_DR}}': fm(med.get('drone')),
    '{{MED_A}}': fm(med.get('A')), '{{MED_BD}}': fm(med.get('Bd')), '{{MED_BF}}': fm(med.get('Bf')),
    '{{A_CRASH}}': f'{s["A_crash_rate"] * 100:.0f}', '{{A_WRECKED}}': str(s['A_wrecked']), '{{A_N}}': str(s['A_n']), '{{A_STOP}}': f'{s["A_stop"]:.0f}',
    '{{SKY_MIN}}': f'{s["sky_min"]:,}', '{{SKY_MAX}}': f'{s["sky_max"]:,}', '{{BF_JAM}}': f'{s["Bf_jam"]:.1f}', '{{BF_WAIT}}': f'{s["Bf_wait"]:.1f}', '{{BF_COST}}': f'{s["Bf_cost"] / 10000:.1f}',
    '{{DRONE_SEC}}': f'{clip_info.get("drone", {}).get("sec", 0):.0f}', '{{ALLFLY_SEC}}': f'{clip_info.get("mode_allfly", {}).get("sec", 0):.0f}', '{{ALLDRONE_SEC}}': f'{clip_info.get("mode_alldrone", {}).get("sec", 0):.0f}',
}
if dr: rep.update({'{{DR_FLY}}': f'{dr["flyMin"]:.0f}', '{{DR_WAIT}}': f'{dr["waitMin"]:.1f}', '{{DR_COST}}': f'{dr["cost"]:,}', '{{DR_KM}}': f'{dr["km"]}', '{{DR_WORK}}': E(dr['work'])})
for k, v in rep.items(): page = page.replace(k, v)
left = [x for x in set(__import__('re').findall(r'\{\{[A-Z_]+\}\}', page))]
if left: print('UNFILLED', left)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)
tot = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs); n = sum(len(fs) for _, _, fs in os.walk(OUT))
print(f'art: {n} files, {tot / 1e6:.1f} MB')
