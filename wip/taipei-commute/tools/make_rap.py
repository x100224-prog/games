#!/usr/bin/env python3
"""產生《布丁狗去鶯歌》配樂裡的饒舌人聲音軌（8 小節、128 BPM）。

用法: python3 tools/make_rap.py <vits-melo-tts-zh_en 模型資料夾> <輸出.mp3> [歌詞.json]
     歌詞.json：四句，每句是 [[十六分音符位置, 詞], ...]；不給就用《布丁狗去鶯歌》的歌詞

做法：
  1. 用 MeloTTS（MIT 授權，sherpa-onnx 版）把歌詞一個詞一個詞念出來
  2. 去頭尾靜音，用 rubberband 降 2 個半音（保留咬字），太長的詞加速塞進拍子裡
  3. 依十六分音符位置排到時間軸上，加一軌稍微錯開的疊聲讓聲音厚一點
  4. 濾掉低頻、加一點臨場感、壓縮、加八分音符延遲回音，輸出 MP3
歌詞為本遊戲原創。
"""
import os, sys, subprocess, tempfile
import numpy as np
import sherpa_onnx

MODEL, OUT = sys.argv[1], sys.argv[2]
BPM = 128; STEP = 60 / BPM / 4; SR = 44100
BARS = 8; TOTAL = BARS * 16 * STEP
PITCH = 2 ** (float(os.environ.get('SEMI', '-2')) / 12)   # 降 2 個半音（語音辨識測過，比降 3 個半音清楚）
PRE = 0.035                     # 每個詞保留的前置時間（讓子音不被切掉），排拍子時往前挪這麼多

# 每句兩小節：[十六分音符位置(0~31), 詞]
RAP = [
    [(0, '布丁狗'), (6, '出發'), (16, '蘆洲'), (22, '天剛亮')],
    [(0, '油門'), (4, '踩下去'), (16, '國道'), (20, '一路往南闖')],
    [(0, '過了'), (4, '三鶯橋'), (16, '鶯歌'), (20, '就在前方')],
    [(0, '停好車'), (6, '走進站'), (16, '準時'), (22, '不慌張')],
]
if len(sys.argv) > 3:
    import json
    RAP = [[(int(p), w) for p, w in line] for line in json.load(open(sys.argv[3], encoding='utf-8'))]

cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=os.path.join(MODEL, 'model.onnx'), lexicon=os.path.join(MODEL, 'lexicon.txt'),
                                               tokens=os.path.join(MODEL, 'tokens.txt'), dict_dir=os.path.join(MODEL, 'dict')),
    num_threads=4), rule_fsts=','.join(os.path.join(MODEL, f) for f in ('date.fst', 'number.fst', 'phone.fst', 'new_heteronym.fst')))
tts = sherpa_onnx.OfflineTts(cfg)
tmp = tempfile.mkdtemp()

def ff(args):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + args, check=True)

def read_wav(fn):
    import wave
    w = wave.open(fn); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    if w.getnchannels() == 2: a = a.reshape(-1, 2).mean(1)
    return a

def write_wav(fn, a, sr=SR):
    import wave
    w = wave.open(fn, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()

def say(text, slot):
    """念一個詞，降 3 個半音，長度不超過 slot 秒。"""
    g = tts.generate(text, sid=0, speed=1.1)
    a = np.array(g.samples, dtype=np.float32); sr = g.sample_rate
    # 去頭尾靜音
    env = np.abs(a); thr = env.max() * 0.02
    idx = np.where(env > thr)[0]
    a = a[max(0, idx[0] - int(PRE * sr)): idx[-1] + int(0.04 * sr)]
    src = os.path.join(tmp, 'w.wav'); dst = os.path.join(tmp, 'p.wav'); write_wav(src, a, sr)
    dur = len(a) / sr
    tempo = max(1.0, min(1.8, dur / (slot * 0.95)))
    ff(['-i', src, '-af', f'aresample={SR},rubberband=pitch={PITCH:.5f}:tempo={tempo:.4f}:formant=preserved', '-ar', str(SR), dst])
    return read_wav(dst)

def say_line(words):
    """整句一起念（有上下文、咬字比較準），再從停頓處切成一個個詞。"""
    # 語音模型常把整句第一個詞念糊，所以前面墊一個「嘿」再丟掉
    words = ['嘿'] + list(words)
    g = tts.generate('，'.join(words) + '。', sid=0, speed=1.05)
    a = np.array(g.samples, dtype=np.float32); sr = g.sample_rate
    hop = int(0.01 * sr); fr = np.array([np.sqrt((a[i:i + hop] ** 2).mean()) for i in range(0, len(a) - hop, hop)])
    quiet = fr < fr.max() * 0.03
    # 找出最長的 len(words)-1 段靜音當切點
    runs, i = [], 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]: j += 1
            runs.append((j - i, i, j)); i = j
        else: i += 1
    voiced = np.where(~quiet)[0]; v0, v1 = voiced[0], voiced[-1]
    inner = sorted([r for r in runs if r[1] > v0 and r[2] < v1], reverse=True)[:len(words) - 1]
    cuts = sorted((r[1] + r[2]) // 2 for r in inner)
    if len(cuts) != len(words) - 1: return None
    edges = [max(0, v0 - 3)] + cuts + [v1 + 4]
    segs = []
    for k in range(len(words)):
        seg = a[edges[k] * hop: edges[k + 1] * hop]
        e = np.abs(seg); idx = np.where(e > e.max() * 0.02)[0]
        segs.append((seg[max(0, idx[0] - int(PRE * sr)): idx[-1] + int(0.04 * sr)], sr))
    return segs[1:]

def shape(a, sr, slot):
    src = os.path.join(tmp, 'w.wav'); dst = os.path.join(tmp, 'p.wav'); write_wav(src, a, sr)
    tempo = max(1.0, min(1.8, len(a) / sr / (slot * 0.95)))
    ff(['-i', src, '-af', f'aresample={SR},rubberband=pitch={PITCH:.5f}:tempo={tempo:.4f}:formant=preserved', '-ar', str(SR), dst])
    return read_wav(dst)

track = np.zeros(int(TOTAL * SR) + SR, dtype=np.float32)
dbl = np.zeros_like(track)
for li, line in enumerate(RAP):
    base = li * 32
    segs = say_line([w for _, w in line])
    if segs is None: print('line', li + 1, 'split failed, fallback to per-word')
    for k, (pos, word) in enumerate(line):
        nxt = line[k + 1][0] if k + 1 < len(line) else 32
        slot = (nxt - pos) * STEP
        v = shape(segs[k][0], segs[k][1], slot) if segs else say(word, slot)
        # 每句最後一個詞（押韻字）稍微重一點
        gain = 1.0 if k < len(line) - 1 else 1.12
        st = max(0, int(((base + pos) * STEP - PRE / 1.0) * SR))
        track[st:st + len(v)] += v * gain
        off = int(0.024 * SR)                                  # 疊聲：晚 24 ms、小聲
        if not os.environ.get('DRY'): dbl[st + off:st + off + len(v)] += v * 0.22
mix = track + dbl
raw = os.path.join(tmp, 'raw.wav'); write_wav(raw, mix / (np.abs(mix).max() + 1e-6) * 0.9)
# 人聲處理：去低頻、臨場感、壓縮、八分音符回音
delay_ms = int(STEP * 2 * 1000)
af = (f'highpass=f=140,equalizer=f=3200:t=q:w=1.2:g=4,equalizer=f=280:t=q:w=1:g=-3,'
      f'acompressor=threshold=0.12:ratio=4:attack=4:release=90:makeup=2,'
      + ('' if os.environ.get('DRY') else f'aecho=0.9:0.6:{delay_ms}:0.12,') + 'alimiter=limit=0.89')
ff(['-i', raw, '-af', af, '-t', f'{TOTAL + 0.6:.3f}', '-ar', str(SR), '-ac', '1', '-b:a', '96k', OUT])
print('wrote', OUT, os.path.getsize(OUT), 'bytes', f'{TOTAL:.2f}s')
