#!/usr/bin/env python3
"""把 web/game.html（Artifact 用的頁面內容）包成可以直接架站的 web/index.html。"""
import sys, os
root = os.path.join(os.path.dirname(__file__), '..', 'web')
src = open(os.path.join(root, 'game.html'), encoding='utf-8').read()
i = src.index('<div id="app">')
head, body = src[:i], src[i:]
html = ('<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + '</head>\n<body>\n' + body + '</body>\n</html>\n')
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(html)
print('wrote web/index.html')
