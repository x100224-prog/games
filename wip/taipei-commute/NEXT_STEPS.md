# 台北上班路：進度（2026-10-17 15:00 更新）

## 已完成
- 線上版 main（d452ae8）：修正車子開不動、加入「看示範」（9 段，已逐段測過能跑完）、兩個新玩法（一般模式擁有飛天跑車＋無人機飛行系統後解鎖，解鎖旗標 localStorage taipei-commute-unlock）。
- artifact 試看版：https://claude.ai/artifact/HUxKh2zE8gfrQCxY5YJAZW（tools/build_art.py 產生 build/art/，config.js 的 unlockModes 改成 true；兩支錄好的影片；4 組實測比較）。
- 實測：使用者說先不用補（第 4、6、7 組沒跑）。

## 還沒做
- 下午兩點的新需求：全城無人機再加一個版本——路面照常有車，玩家要升空時，總系統評估「繼續開」和「飛」哪個比較快（地面用各路段即時車速／排隊，天上用各高度層密度與起降等待），並用實際跑完的時間檢驗。
- 新玩法的完整一天（下班回家、商店）沒有完整測過。

---
（以下是之前的筆記）
# 台北上班路：目前進度與下一步（2026-10-17 11:52 備份，使用者用量剩 16% 先暫停）

這個分支只是備份，線上版（main，3c57198）沒有更新。

## 使用者目前的決定（依時間）
- 不錄影片了，改成遊戲內「看示範」（即時播放、字幕、看完可接手）。已錄好的 clips/boost.mp4、clips/flip.mp4 留著，放進 artifact。其餘錄影不做。
- 無人機到目的地只要片段。
- git 線上版：要有示範模式＋「車子開不動」修正＋兩個新玩法，但兩個新玩法要在一般模式買了飛天跑車和無人機飛行系統後才解鎖（這項「最後做」）。
- artifact 版：示範模式＋兩個新玩法（可直接玩，不用解鎖）＋兩支影片＋實測比較。
- 下午兩點的新需求：全城無人機再加一個版本——路面照常有車，玩家要升空時，總系統評估「繼續開」和「飛」哪個比較快（地面用各路段即時車速／排隊，天上用各高度層密度與起降等待），並用實際跑完的時間檢驗。

## 已完成（在 web/ 裡，未上線）
- 修正：線上版從 5a66bb4 開始進駕駛座後車子開不動（main.js driveFrame 的 `flight.animate` 插在 if/else 中間）。已驗證車子會加速。
- 兩個新玩法（選單「玩法」、各自存檔）：全城飛天跑車（allfly）、全城無人機（alldrone，web/js/sky.js）。全城無人機的起飛／巡航／降落已實測能完成。
- 實測 tests/measure3.mjs：第 0、1、5、8 組完成（build/measure3.json）。
- 示範模式（剛寫完、還沒測過）：web/js/demo.js（DemoRunner、DEMOS 9 段）、main.js 的 startDemo/demoEnter/endDemo/demoUi、game.html 的 #demoOpts #demoCap #demoSpeed #demoExit。網址 #demo-boost 可以直接開始。

## 待辦（依這個順序）
1. 示範模式除錯：`node tests/demo_test.mjs boost,hop`（要用 nohup 背景跑、看 build/demo_test.log；前景跑 10 分鐘會被中斷，第一次就是這樣、一行結果都沒有，不知道是卡住還是太慢）。再測 flip,wall,under,empty,drone,allfly,alldrone。
2. 新玩法完整一天（下班回家、商店）測試。
3. 補實測：`node tests/measure3.mjs "4,6,7"`；一般世界無人機 `node tests/measure2.mjs 2 drone 4`。
4. artifact：tools/build_art.py＋tools/art_template.html 要改成「示範＋兩支影片＋實測比較＋可以玩」（原本是一堆影片，要拿掉沒錄的）；artifact 裡新玩法直接解鎖。
5. 最後：線上版新玩法解鎖條件（一般模式擁有 roadster＋drone；建議買到時在 localStorage 記一個解鎖旗標，重開新遊戲也不會再鎖），然後更新 git main（複製 index.html、js/*.js 除了 main_yingge.js 到 games/taipei/，commit，push）。

## 注意
- 工作區會重開，背景程式會停；只有我在工作時才會跑。
- 無頭瀏覽器畫面很慢（約正常速度三分之一）。
