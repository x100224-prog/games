#!/bin/sh
# 把共用程式碼與資料組成「布丁狗去鶯歌」網站資料夾 web-yingge/
set -e
cd "$(dirname "$0")/.."
mkdir -p web-yingge/js web-yingge/lib web-yingge/models
for f in config input world parking traffic vehicles avatar tpcam signs music engine main_yingge; do cp web/js/$f.js web-yingge/js/; done
cp web/lib/three.module.min.js web/lib/GLTFLoader.js web/lib/BufferGeometryUtils.js web/lib/RoundedBoxGeometry.js web-yingge/lib/
cp web/models/hero.json web-yingge/models/
mkdir -p web-yingge/audio && cp web/audio/rap.mp3 web-yingge/audio/
cp web/game_yingge.html web-yingge/game.html
python3 - <<'PY'
src = open('web-yingge/game.html', encoding='utf-8').read()
i = src.index('<div id="app">')
html = ('<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + src[:i] + '</head>\n<body>\n' + src[i:] + '</body>\n</html>\n')
open('web-yingge/index.html', 'w', encoding='utf-8').write(html)
PY
echo "web-yingge ready"
