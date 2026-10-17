#!/usr/bin/env python3
"""試看版 artifact（build/art/）：遊戲（新玩法直接開放）＋示範清單＋兩支錄好的影片＋新玩法實測。不碰 git。"""
import json, os, re, shutil, subprocess, statistics, html
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
B = os.path.join(ROOT, 'build'); OUT = os.path.join(B, 'art'); WEB = os.path.join(ROOT, 'web')
if os.path.isdir(OUT): shutil.rmtree(OUT)
os.makedirs(os.path.join(OUT, 'clips'))
E = html.escape

# 影片：只放錄好的兩支
for k in ['boost', 'flip']:
    src = os.path.join(B, 'clips', k + '.mp4')
    shutil.copy(src, os.path.join(OUT, 'clips', k + '.mp4'))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '2.6', '-i', src, '-frames:v', '1', '-q:v', '5', os.path.join(OUT, 'clips', k + '.jpg')], check=True)

# 遊戲：新玩法直接解鎖
G = os.path.join(OUT, 'game'); os.makedirs(os.path.join(G, 'js')); os.makedirs(os.path.join(G, 'models'))
shutil.copy(os.path.join(WEB, 'index.html'), os.path.join(G, 'index.html'))
for f in os.listdir(os.path.join(WEB, 'js')):
    if f.endswith('.js') and f != 'main_yingge.js': shutil.copy(os.path.join(WEB, 'js', f), os.path.join(G, 'js', f))
cfg = open(os.path.join(G, 'js', 'config.js'), encoding='utf-8').read()
assert 'unlockModes: false' in cfg
open(os.path.join(G, 'js', 'config.js'), 'w', encoding='utf-8').write(cfg.replace('unlockModes: false', 'unlockModes: true'))
shutil.copytree(os.path.join(WEB, 'lib'), os.path.join(G, 'lib'))
shutil.copytree(os.path.join(WEB, 'data'), os.path.join(G, 'data'))
shutil.copy(os.path.join(WEB, 'models', 'hero.json'), os.path.join(G, 'models', 'hero.json'))
os.makedirs(os.path.join(G, 'audio')); shutil.copy(os.path.join(WEB, 'audio', 'cyber.mp3'), os.path.join(G, 'audio', 'cyber.mp3'))   # 看示範的配樂

# 示範清單（跟 web/js/demo.js 的 DEMOS 一樣）
demo_src = open(os.path.join(WEB, 'js', 'demo.js'), encoding='utf-8').read()
demos = re.findall(r"\{ key: '(\w+)', name: '([^']+)', sub: '([^']+)'(?:, near: true)?(?:, mode: '(\w+)')? \}", demo_src)
assert len(demos) == 9, demos
btn = ['        <button class="dbtn play" type="button" data-demo=""><b>自己玩</b><span>打開選單：選玩法、住址和公司</span></button>', '        <h3>飛天跑車</h3>']
for key, name, sub, mode in demos:
    if key == 'drone': btn.append('        <h3>無人機系統</h3>')
    if key == 'allfly': btn.append('        <h3>新玩法</h3>')
    cls = ' a' if mode == 'allfly' else ' b' if mode == 'alldrone' else ''
    btn.append(f'        <button class="dbtn{cls}" type="button" data-demo="{key}"><b>{E(name.replace("新玩法：", ""))}</b><span>{E(sub)}</span></button>')

# 實測（新玩法跑完的組）
m2 = json.load(open(os.path.join(B, 'measure2.json'))); m3 = json.load(open(os.path.join(B, 'measure3.json')))
def get(rows, p, mode):
    for r in rows:
        if r.get('pair') == p and r.get('mode') == mode and r.get('ok') and r.get('min'): return r
pairs = sorted({r['pair'] for r in m3 if all(get(m3, r['pair'], m) for m in ['A-roadster', 'B-drive', 'B-fly'])})
def med(rows, mode):
    v = [get(rows, p, mode)['min'] for p in pairs if get(rows, p, mode)]
    return (statistics.median(v), len(v)) if v else (None, 0)
M = {k: med(r, m) for k, r, m in [('gas', m2, 'gas'), ('roadster', m2, 'roadster'), ('drone', m2, 'drone'), ('A', m3, 'A-roadster'), ('Bd', m3, 'B-drive'), ('Bf', m3, 'B-fly')]}
print('pairs', pairs, {k: (round(v[0], 1) if v[0] else None, v[1]) for k, v in M.items()})
vmax = max(v[0] for v in M.values() if v[0])
def bar(k, label, cls):
    v, n = M[k]
    if v is None: return ''
    note = f' <small>({n} 組)</small>' if n < len(pairs) else ''
    return f'          <div class="bar {cls}"><span>{E(label)}{note}</span><div class="bt"><i style="width:{v / vmax * 100:.1f}%"></i></div><div class="bv">{v:.0f} <small>分</small></div></div>'
bars_a = '\n'.join([bar('gas', '一般世界・油車', 'base'), bar('roadster', '一般世界・飛天跑車', 'base'), bar('A', '全城飛天跑車・主角', 'a')])
bars_b = '\n'.join([bar('Bd', '在空的路上開', 'b'), bar('Bf', '跟著大家飛', 'b'), bar('drone', '一般世界・無人機', 'base')])
A = [get(m3, p, 'A-roadster') for p in pairs]; Bf = [get(m3, p, 'B-fly') for p in pairs]
rep = {
    '{{DEMO_BUTTONS}}': '\n'.join(btn), '{{BARS_A}}': bars_a, '{{BARS_B}}': bars_b, '{{NPAIRS}}': str(len(pairs)),
    '{{A_CRASH}}': f'{statistics.median([x["cityCrashes"] / max(1, x["cityHops"]) for x in A]) * 100:.0f}',
    '{{A_N}}': str(len(A)), '{{A_WRECKED}}': str(sum(1 for x in A if x.get('wrecked'))),
    '{{SKY_MIN}}': f'{min(x["sky"] for x in Bf):,}', '{{SKY_MAX}}': f'{max(x["sky"] for x in Bf):,}',
    '{{BF_JAM}}': f'{statistics.median([x["jamMin"] for x in Bf]):.1f}', '{{BF_WAIT}}': f'{statistics.median([x["liftWaitMin"] + x["crossWaitMin"] + x["waitMin"] for x in Bf]):.1f}',
}
page = open(os.path.join(ROOT, 'tools', 'art_template.html'), encoding='utf-8').read()
for k, v in rep.items(): page = page.replace(k, v)
left = re.findall(r'\{\{[A-Z_]+\}\}', page); assert not left, left
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)
files = {}
for d, _, fs in os.walk(OUT):
    for f in fs:
        p = os.path.relpath(os.path.join(d, f), OUT)
        if p != 'index.html': files[p] = os.path.join(d, f)
json.dump(files, open(os.path.join(B, 'art_files.json'), 'w'), indent=0)
tot = sum(os.path.getsize(v) for v in files.values()) + os.path.getsize(os.path.join(OUT, 'index.html'))
print(f'art: {len(files) + 1} files, {tot / 1e6:.1f} MB')
