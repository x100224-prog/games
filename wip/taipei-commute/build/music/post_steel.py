import numpy as np, wave, json
w = wave.open('steel_raw.wav'); n = w.getnframes(); sr = w.getframerate()
x = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, 2).astype(np.float32) / 32767
bar = json.load(open('steel_meta.json'))['bar']; B = lambda k: int(round(k * bar * sr))
Ln = B(9) - B(8); seg = x[B(48):B(48) + Ln].copy(); y = x[:B(48)].copy(); y[B(8):B(9)] = seg
fade = int(0.01 * sr); k = B(9); r = np.linspace(0, 1, fade)[:, None]; y[k - fade:k] = seg[-fade:] * (1 - r) + x[k - fade:k] * r
y = np.tanh(y * 1.1) / np.tanh(1.1); y = y / np.max(np.abs(y)) * 0.93
o = wave.open('steel.wav', 'wb'); o.setnchannels(2); o.setsampwidth(2); o.setframerate(sr); o.writeframes((y * 32767).astype(np.int16).tobytes()); o.close()
json.dump({'bar': bar, 'loopStart': B(8) / sr, 'loopEnd': B(48) / sr, 'len': len(y) / sr}, open('steel_meta.json', 'w'))
m = y.mean(1)
def bands(a):
    f = np.abs(np.fft.rfft(a * np.hanning(len(a)))) ** 2; fr = np.fft.rfftfreq(len(a), 1 / sr); tot = f.sum()
    return [round(float(10 * np.log10(f[(fr >= lo) & (fr < hi)].sum() / tot + 1e-12)), 1) for lo, hi in [(20, 60), (60, 250), (250, 2000), (2000, 6000), (6000, 16000)]]
for name, b0 in [('intro', 1), ('intro2', 5), ('A', 12), ('break', 26), ('B', 36)]:
    s = m[int(b0 * bar * sr):int((b0 + 2) * bar * sr)]
    print(name, 'rms dB', round(float(20 * np.log10(np.sqrt(np.mean(s ** 2)))), 1), 'sub/low/mid/hi/air', bands(s))
