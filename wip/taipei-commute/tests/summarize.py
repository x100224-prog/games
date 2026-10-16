import json, statistics as st
rows = json.load(open('build/measure2_all.json'))
by = {}
for r in rows:
    if r.get('ok'): by.setdefault(r['pair'], {})[r['mode']] = r
print('pair district        km   free  gas   roadster(hops) drone(wait)  gas km/h')
sr, sd, speeds = [], [], []
for p in sorted(by):
    m = by[p]; g = m.get('gas'); rs = m.get('roadster'); dr = m.get('drone')
    if g: speeds.append(g['km'] / (g['min'] / 6 / 60))
    line = f"{p:>3} {m[next(iter(m))]['district']:<6} {g['routeKm'] if g else '':>6} {g['freeFlowGameMin'] if g else '':>5} {g['min'] if g else '':>6} {str(rs['min'])+'('+str(rs['hops'])+')' if rs else '':>12} {str(dr['min'])+'('+str(dr['waitMin'])+')' if dr else '':>12} {round(speeds[-1],1) if g else ''}"
    print(line)
    if g and rs: sr.append(g['min'] - rs['min'])
    if g and dr: sd.append(g['min'] - dr['min'])
print('roadster saved per trip:', sr, 'median', st.median(sr) if sr else None, 'mean', round(st.mean(sr),1) if sr else None)
print('drone saved per trip:', [round(x,1) for x in sd], 'median', st.median(sd) if sd else None, 'mean', round(st.mean(sd),1) if sd else None)
print('gas speeds km/h', [round(s,1) for s in speeds], 'median', round(st.median(speeds),1))
dc = [r['cost'] for r in rows if r.get('ok') and r['mode']=='drone']; print('drone fuel cost per trip', dc)
