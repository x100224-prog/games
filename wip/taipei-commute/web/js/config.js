// 遊戲的可調參數集中在這裡。之後要加賺錢制度、真實車流量，多半只需要改這個檔。

export const CLS = { MOTORWAY: 0, TRUNK: 1, PRIMARY: 2, SECONDARY: 3, TERTIARY: 4, RESIDENTIAL: 5, SERVICE: 6, LINK: 7 };
export const CLS_NAME = ['國道', '快速道路', '主要幹道', '次要幹道', '一般道路', '巷道', '巷弄', '匝道'];

// 平均車流密度：每公里、每車道上的車輛數（依道路等級）。
// 之後要換成「每條路的真實車流量」時，在 traffic.js 的 edgeDensity() 讀取每條路自己的值即可。
export const TRAFFIC_DENSITY = [14, 16, 20, 15, 9, 2.2, 0.5, 8];

export const TRAFFIC = {
  radius: 260,        // 玩家周圍多遠內有車流 (m)
  despawn: 330,       // 超過就回收
  minSpawnDist: 80,   // 不在玩家眼前憑空出現
  maxCars: 140,
};

export const VIEW = {
  loadRadius: 1100,   // 載入小格的半徑 (m)
  unloadRadius: 1700,
  fogNear: 260,
  fogFar: 1050,
};

export const TIME = {
  startMin: 7 * 60 + 30,  // 每天 07:30 起床
  workMin: 9 * 60,        // 09:00 上班
  homeMin: 18 * 60,       // 18:00 下班
  scale: 6,               // 現實 1 秒 = 遊戲 6 秒
};

export const CARS = {
  gas: {
    key: 'gas', name: '油車', model: '國民房車 1.6',
    color: 0xb8433a, maxSpeed: 150 / 3.6, accel: 3.4,
    energyName: '汽油', unit: 'L', capacity: 45, perKm: 0.085,   // 約 11.8 km/L
  },
  berlingo: {
    key: 'berlingo', name: '布丁狗', model: 'berlingo', fullName: '雪鐵龍 Berlingo',
    color: 0x2f7c90, maxSpeed: 160 / 3.6, accel: 3.1, cockpitLift: 0.24,
    energyName: '汽油', unit: 'L', capacity: 50, perKm: 0.066,
  },
  ev: {
    key: 'ev', name: '電動車', model: '都會電動車 EV', electric: true,
    color: 0xe9eef0, maxSpeed: 150 / 3.6, accel: 4.6,
    energyName: '電量', unit: 'kWh', capacity: 60, perKm: 0.16,  // 約 6.2 km/kWh
  },
  // 飛天跑車：電動雙座跑車＋高壓氣體推進器（特技燃料另外計算，見 stunts.js）
  roadster: {
    key: 'roadster', name: '飛天跑車', model: 'roadster', electric: true,   // 飛天跑車也是電動車：可停電動車專用格、充電、算電費
    color: 0xc4161c, maxSpeed: 200 / 3.6, accel: 8.5, cockpitLift: -0.14,
    cabin: { z: 0.4, pillarTop: 1.37, roofY: 1.39, linerZ: 0.45, linerD: 1.3, mirrorY: 1.3 }, seat: { tilt: 0 },
    energyName: '電量', unit: 'kWh', capacity: 200, perKm: 0.15,
    stunt: true,
  },
};

export const PARK = {
  bayLen: 5.6, bayWid: 2.2,
  lotBayLen: 5.2, lotBayWid: 2.5,
  roadsideOccupied: 0.74,   // 路邊車格被占用的比例
  lotOccupied: 0.8,
  posTol: 1.15, latTol: 0.65, angTol: 0.30,  // 停妥的容許誤差 (m, m, rad)
  rushR: 110,               // 早上公司附近這個範圍內的路邊格都停滿了 (m)
};

// 上下班尖峰：車流密度乘上這個倍數（之後做塞車時會再調）
export const RUSH = { factor: 1.8 };

export const WORK_DIST = { min: 1800, max: 4800 };  // 住家到工作地點的直線距離範圍 (m)
