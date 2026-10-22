# 台北上班路：進度（2026-10-22 更新）

## 已完成
- 2026-10-22（線上 main b708b64、artifact v17）：空氣罐改成每開 200 公尺補 5%（economy.js AIR.drivePerKm 0.25；示範「壓縮空氣用完」開 245 m 從 0 補到 5.8%，tests/demo_air.mjs）。手機「翻轉」：原本是飛起來才出現在另一個位置的按鈕，飛行約 2.9 秒、翻一圈要 0.9 秒，按太晚會落地翻車、空氣不到 3% 不能翻。改成：飛起來後「飛越」同一個位置變成「翻轉」（game.html #btnFlip）；來不及翻一圈就不翻、跳提示（stunts.js landIn／canFlip、_lowT），按鈕變灰；在畫面上左右快速滑一下（450 ms 內、>50 px）往那邊翻（input.js swipeFlip／flipDir）。說明多一行手機專用（FEATURE_HELP 'touch'）。測試 tests/phone_flip.mjs。
- 2026-10-21 下午（線上 main 52e9a9d、artifact v16）：在家配樂跳過前奏，從長笛旋律那一小節開始（music.js files.home.startAt 9.6 秒）。住處停車位二選一：economy.js 新增 curbspot「住處路邊停車位」（CURB 蛋黃區 110 萬、內湖 90 萬、其他 65 萬，遊戲設定；家門口藍色 P、住戶專用），garage「住處地下停車位」改成真的地下室：main.js buildBasement／enterBasement／basementFrame／leaveBasement —— 早上出門搭電梯到地下室上車、開出去到家門口；晚上停在家門口紫色 P 按 E 開進地下室，下車走到電梯按 E 回家。有地下停車位時路邊的不能買。測試 tests/garage2_test.mjs；map_test 改用路邊車位。
- 2026-10-21 中午（線上 main f599f19、artifact v14）：
  - 在家配樂：原創「小巷裡的祕密」（tools/town_render.js 離線算、tests/render_town.mjs 存成 web/audio/home.mp3），照使用者描述的 90 年代日式 RPG 城鎮曲：長笛、電貝斯、電鋼琴、鐵琴、弦樂、輕鼓、超任音色；使用者要求拿掉木吉他。D 多利亞、A A' B A'、100 BPM；第 6～38 小節無縫循環（每小節固定亂數，接縫差 0）。music.js 改成通用的音檔播放（files.cyber / files.home），音檔沒載入前用即時合成的備用版。
  - 房間：鋼琴（床和衣櫃中間）、吉他（窗邊吉他架），web/js/instruments.js 照《雞不可失》的譜和「順不順」算法；一天算一次（G.prac 存檔），第一天不順、第二天好一點、第三天順；彈的時候配樂 hold；按 E 或走開就停。
  - 碰撞修車費：economy.js REPAIR（3,000 起、依力道、最多 15,000）；特技翻車、被別人壓到不重複扣（G.bumpFreeT）。
  - 飛天跑車厭惡值（不顯示）：升空落地的下噴煙霧罩到 9 m 內的車每台 +1，ANNOY.limit 40 → 特殊功能停用 24 小時（G.banUntil 用絕對遊戲分鐘，存檔）；每天消 10；在空中不會被停用（只擋從地面開始的特技）；示範不算。
  - 空氣罐：拿掉回家補滿、充電格補氣和費用，只靠開車每公里補 5%。
  - 主角模型的 Pistol 節點藏起來。
- 2026-10-19 下午：路邊停車格和停車場都按小時收費（economy.js ROAD_RATE 蛋黃區 50、內湖 40、其他 30；LOT_RATE 60／50／40；停車場裡的電動車格也收停車費），早上停到 18:00、晚上過夜停到隔天 7:30，不滿一小時算一小時（main.js lotInfo、arrive）。
- 2026-10-19 中午：手機走路時油門／煞車換成「跑步」按鈕（按一下開、再按一下關；input.runOn），電腦 Shift 跑步寫進說明。提示（#toast、#prompt）包進 #hints，排成一欄放在畫面左邊（手機直向在路名下面、手機橫向在任務欄和搖桿中間、電腦在任務欄下面），量測不再壓到人物（tests/phone_walk.mjs）。手機橫向後照鏡按鈕列移到搖桿右邊；飛行中不顯示後照鏡按鈕。
- 2026-10-19 中午：停車規則改成哪裡都能停：拿掉早上公司 110 m 內全滿；停車場不用先有錢；停進格子＝合法；路邊沒格子、壓線、油車停電動車格＝違規，可能被拖吊（遊戲設定：上班時 35%、晚上過夜 25%）。拖吊用真實臺北市規定：移置費 1,500、保管費每半天 200（1 小時內免）、六個保管場依行政區（位置照地址找路／巷口，大約）；搭計程車（85 元起跳 1.25 km、每 200 m 5 元、夜間 +20）去保管場，扣錢、時間往後，車子在保管場門口（紅色「拖吊保管場」牌）。上班時被拖 → 18:00 下班發現；晚上被拖 → 隔天早上出門發現（存檔 towNext）。main.js towPickup、curbSpot、towMark；economy.js TOW、towYard、towStorage、taxiFare。測試 tests/tow_test.mjs（TOW=1 一定被拖、TOW=0 一定不被拖）。
- 2026-10-18 23 點（線上 main a8093f2、artifact v11）：停車場開放計時收費（economy.js LOT_RATE：蛋黃區每小時 60、內湖 50、其他 40，遊戲設定；真實臺北市公有停車場 10～60 元）。身上的錢夠付才能停（一開始沒錢只能停路邊），可以自己選的停車場格子用藍色標示；早上算到 18:00、晚上過夜算到隔天 7:30（main.js lotInfo、canPark）。示範的自動停車仍只用路邊格／電動車格（bayAllowed）。早上公司 110 m 內路邊格全滿的設定沒改。測試 tests/lot_test.mjs、tests/park_probe.mjs。
- 2026-10-18 深夜（線上 main 80ae632、artifact v10）：全螢幕地圖改成 web/js/citymap.js（滾輪／兩指／＋－縮放、拖曳、「我」「全市」；路名依道路等級和縮放顯示，資料 web/data/maplabels.json 由 tools/build_maplabels.py 產生；放大後顯示停車場 P；標出家、公司、你的車停在這裡、地下停車位）。商店新增「住處地下停車位」（economy.js GARAGE：大安等蛋黃區 280 萬、內湖 220 萬、其他 160 萬，遊戲設定；不算換住址的次數）：早上車子在家門口的車位（main.js garageSpot、G.atGarage），晚上開到紫色 P 7 公尺內就算停好。測試 tests/map_test.mjs。
- 2026-10-18 晚：駕駛座以擋風玻璃為主（不畫方向盤、儀表台／車門／引擎蓋放低、A 柱細、座椅預設 tilt 5、seatKey taipei-seat3-；量測 tests/cockpit_frame.mjs：電腦 80～82%、手機直 86～91%、手機橫 83～85%）；手機直拿中控螢幕改貼在畫面上（#navMini）；手機不顯示電腦按鍵（main.js touchify、.k-desk/.k-touch、input.coarse）；手機「橫向玩」（全螢幕＋鎖方向，不行就 html.rot90 轉 90 度，排版改用 @container app）。
- 2026-10-18：每買一樣新系統或車子，可以換一次住址或工作（econ.moves；結算畫面的「換住址或工作」→ #pgMove；搬家只列離公司 1.8～4.8 km 的住址，隔天生效、存款保留）。
- 2026-10-18：開始時分三頁選行政區、住址、工作（web/game.html 的 #pgTitle #pgDist #pgHome #pgWork，main.js showPage）；薪水看工作地點、房租／房貸看住哪一區（economy.js 的 LIFE、jobPay、homeCost），選的時候看不到，打卡和結算時才知道；介面拿掉收入、價錢的說明。
- 第三個新玩法「全城無人機・路空總控」（hybrid）：web/js/control.js（總控：降落時段排隊、Wardrop 式分配飛／開的比例、按 U 評估開 vs 飛、地面等待）、sky.js（天上的車跟路上的車互相交換）、traffic.js（takeForLift／laneAt／addAt）、drone.js（排好的降落時段、預估 vs 實際）、main.js（問總控、卡片、手機版精簡卡片）、demo.js（第 10 段示範）。
- 實際跑完檢驗（tests/hybrid_test.mjs）：飛 預估 23／實際 21 分；8:10 出門先開再飛 預估 45／實際 41 分；近距離建議開車 預估 26／實際 20 分（build/hybrid_check.json）。
- 試看頁：tools/hybrid_model.mjs → build/hybrid_model.json（不同出門時間總控建議飛的組數）。
- 示範配樂：原創曲「鉻色脈衝」（web/audio/cyber.mp3，music.js CYBER_LOOP）。

## 還沒做
- 新玩法的完整一天（下班回家、商店）沒有完整測過。
- 手機橫向飛行時，避撞面板（DAA）會壓到任務欄下緣（之前就有）。

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
