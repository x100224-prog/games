# 台北上班路：進度（2026-10-22 更新）

## 已完成
- 2026-10-23 晚（線上 main f2dd5b0、artifact v21）：路線預覽改成只在要轉彎的路口（3 條路以上的路口、方向改變）顯示路名牌（pvNextTurn；轉進迴轉道＝迴轉，路名用迴轉後的路），直走時提示「沿著 X 直走 N，然後右轉進入 Y」。沿路地標：build_tiles.py 產生 meta.marks（789 個：捷運 75、火車 5、學校 314、大學 43、醫院 47、公園 105（2 公頃以上）、百貨 70、博物館 94、市府／區公所 25、超高大樓 11；不用亂數，其他資料不變，已驗證），預覽時找路線旁的地標（大樓 700 m 內、站 90 m 內、其他離路 45 m 內），前方 180 m 起在 #pvMark 說「前方 N m 右邊：某某」，3D 標示（Sprite）放在路邊靠地標那側。目前路名、高度改用路線自己的路段（pvRouteEdge、edgeHeightAt），不會在高架匝道下認錯成匝道。
- 2026-10-23 傍晚（線上 main ff3fa5c、artifact v20）：商店新增「路線預覽」（economy.js SHOP preview，requires nav，PRICE_FIXED 15 萬遊戲設定）。停在車上按 P（手機在「⋯」→ 預覽路線；電腦提示列有「P 預覽路線」）：main.js startPreview／previewFrame／endPreview——影子車（car.group 複製）照導航路線開（大馬路約 50、一般 40、巷子 30 km/h，轉彎前放慢，雙向道開右半邊），車外視角（chaseCam 拉高拉遠），車流清掉，遊戲時間不走；路線隨小格載入換成真實道路形狀（pvSetPoly），前方還沒載入就等。畫面上方大的路名牌（#pvSign 仿指25 綠底白字，英文取附近路名牌）顯示下一個路口的交叉路名或要轉進去的路，提示直走／左轉／右轉／迴轉和距離；1×／2×／4×／暫停／結束預覽（Esc、P）。結束後回到車上（附近沒載入就先載入）。測試 tests/preview_test.mjs [phone]（QUICK=1 只跑一段、LOWQ=1 低畫質）。
- 2026-10-22 上午（線上 main c1690bd、artifact v18）：
  - 道路被房子擋住：原因是開放地圖的真實建物外框畫進馬路（騎樓、巷子、用車道數估的路寬；捷運高架／地下車站外框畫在馬路上），遊戲照外框做碰撞。tools/build_tiles.py 新增「道路淨空」（ROADCUT=1 預設）：地面路段（高架離地 <3 m、隧道洞口路面離地 <3 m 也算）的路面＋路口圓盤，從真實建物挖掉；有洞的切成沒洞的幾塊；資料寫明在路上方的（layer≥1、min_height、building:min_level、道路 building_passage／covered、或路被建物整個包住且樓高 ≥8 m）留懸空樓層（建物紀錄 [7] = 懸空高度 dm；world.js 只畫不碰撞，有底面）。全市檢查 tools/audit_roads.py：完全擋住 531 → 0、路被擠窄 2183 → 0。重建要用兩個 DEM：`python3 tools/build_tiles.py build/extract.pkl web/data build/dem_taipei_2025.zip,build/dem_ntpc_2025.zip`（ROADCUT=0 可重現舊資料，已驗證完全相同）。住址清單因此重新挑過（舊存檔用自己存的住址，不受影響）。
  - 手機開車改成車外第三人稱（main.js defaultCam／chaseCam：跟著車頭方向、被建物擋住會拉近、直拿時高一點遠一點、隧道裡放低），不跳座椅調整；「⋯」拿掉視角／座椅／後照鏡，改「畫面：順暢優先／畫質優先」。手機導航畫面一樣貼在右側（navMini）。電腦版仍是駕駛座。
  - 手機卡頓原因（量測 tests/phone_perf.mjs、phone_tris.mjs、phone_cpu.mjs、build_prof.mjs）：駕駛座每格多畫一次後照鏡；2048 柔邊影子多畫一遍城市；行道樹每棵約 420 個三角形（畫面裡最多）；看得到 1.1 km（約 29 個小格）；開到新區域建一個 500 m 小格電腦約 40 ms（建物占一半），手機約 4 倍。已改：手機第三人稱、預設順暢優先（不畫影子、解析度 1；畫質優先時影子 1024、解析度 1.25）、樹簡化（約 110 個三角形）、冷氣機少一點、樹和冷氣機不投影子、看得到約 750 m（VIEW 手機版）。
  - 走回家時車停在門口 3 m 內會一直顯示「上車」到不了家：改成離門口比較近就算到家。
  - 還沒做：建小格拆成好幾格做（開到新區域手機會頓一下）。
- 2026-10-22 中午（線上 main 6a94fb0、artifact v19）：手機在家裡的鏡頭拉高拉遠（main.js ROOM_PHONE：直拿 5.3 m、橫拿 4.6 m、俯角約 47°，鏡頭只會被家具擋住，牆和天花板從外面看是透明的；彈琴時俯角 0.6）。測試 tests/phone_room.mjs。
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
