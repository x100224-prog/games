# 台北上班路：目前進度與下一步（2026-10-17 11:30 備份）

這個分支只是備份，線上版（main）沒有更新。

## 這次做的（還沒上線）
- 修正：線上版從 5a66bb4 開始，進駕駛座後車子開不動（`flight.animate` 插在 if/else 中間）。web/js/main.js 已修正。
- 錄影用的逐格模式：`window.__tc.manual`、`window.__tc.advance(dt, n)`、`window.__tc.camHook`；網址 `#clip,noaa` 降低畫質加快錄影。
- 新玩法（選單最上面「玩法」，各自存檔 taipei-commute-v2-allfly / -alldrone）：
  - 全城飛天跑車（allfly）：traffic.flyerRate = 1、塞住 1.5 秒就飛越、冷卻 8 秒；落地被占就撞成一團。
  - 全城無人機（alldrone）：路上車流 0；web/js/sky.js 的 DenseSky 在玩家附近 1.3 km 模擬「尖峰時路上有多少車，天上就有多少架」，6 個高度層依航向分層、跟車 80 m；玩家穿過高度層時登記「空中柱子」讓那一層的車繞開（drone.js 的 _crossOk / _layerBusy）。
- 實測腳本：tests/measure3.mjs（A-roadster、B-drive、B-fly），結果在 build/measure3.json。已完成第 0、1、5、8 組；第 4、6、7 組還沒跑。另外一般世界的無人機第 4、5 組也還沒量（`node tests/measure2.mjs 2 drone 4`）。
- 錄影腳本：tests/clips.mjs（boost hop flip wall under empty drone）、tests/clips_modes.mjs（allfly / alldrone）。
  - 已錄好：boost、flip。under 錄到一半（要重錄）。
  - 要重錄：hop（等待條件修好了）、wall（改找屋頂夠深、對面開放的大樓，用車外視角）。
  - 還沒錄：empty、drone、mode_allfly、mode_alldrone。
- artifact：tools/build_art.py＋tools/art_template.html（影片集、各玩法比較圖、可以玩的遊戲 game/），還沒發佈。

## 注意
- 工作區（雲端容器）會重開，背景程式會跟著停掉；檔案這次有留下來，但不保證。
- 錄影很慢：每格約 2 秒（swiftshader），整套約 1.5 小時。

## 使用者 11:31 改需求：不用做成影片檔
- 改成「自動看遊玩畫面」：在遊戲裡做示範模式，選一項能力，遊戲自己擺好場景、照腳本操作、畫面上有字幕，即時播放（不錄 mp4）。
- 無人機到目的地只要片段（升空、一段巡航、降落），不用全程。
- 示範的動作沿用 tests/clips.mjs、tests/clips_modes.mjs 的腳本（按鍵、時機、找大樓／高架橋的方法）。

## 下一步
1. 做遊戲內的示範模式（取代錄影）：推進器、飛越車陣、空中翻轉、外牆上屋頂、高架橋底、空氣用完、無人機片段、全城飛天跑車、全城無人機。
2. 跑完 measure3 第 4、6、7 組，measure2 無人機第 4、5 組。
3. `python3 tools/build_art.py`，發佈 artifact（不更新 git main）。
4. 使用者新需求（下午兩點）：全城無人機再加一個版本——路面照常有車，玩家要升空時，總系統評估「繼續開」和「飛」哪個比較快到目的地（地面用各路段即時車速／排隊、天上用各高度層密度與起降等待估時間），並用實際跑完的時間檢驗。
