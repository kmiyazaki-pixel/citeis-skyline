// =====================================================
//  数値定数 - バランス調整はここをいじる
// =====================================================

export const CONFIG = {
  // ワールド (チャンク式ロード)
  WORLD: {
    CHUNK_SIZE: 48,                // 1チャンクの一辺 (ワールド単位)
    CHUNK_SEGMENTS: 24,            // 地形メッシュの分割数
    VIEW_RADIUS: 2,                // プレイヤー周囲に読み込む半径 (2 → 5×5)
    MAX_CHUNK_BUILDS_PER_FRAME: 2, // 1フレームに生成するチャンク数の上限
  },

  // 地形ノイズ
  TERRAIN: {
    SEED: 20260612,
    SCALE: 0.011,      // ノイズ周波数 (小さいほどなだらか)
    HEIGHT: 16,        // 最大標高
    OCTAVES: 4,
    LACUNARITY: 2.1,
    GAIN: 0.5,
    POW: 1.6,          // 谷を広く、山を尖らせる補正
  },
  WATER_LEVEL: 2.4,

  // プレイヤー
  PLAYER: {
    WALK_SPEED: 6,
    RUN_SPEED: 11,
    WATER_SLOW: 0.45,    // 水中の速度倍率
    JUMP_SPEED: 7.5,
    GRAVITY: 20,
    JUMP_BUFFER: 0.15,   // 着地直前のジャンプ入力を生かす猶予 (秒)
    SNAP_DOWN: 0.45,     // 下り坂で地面に吸着する最大段差 (接地の揺れ防止)
    TURN_LERP: 10,       // アバターの向き追従の速さ
    CAM_DISTANCE: 7,
    CAM_HEIGHT: 2.6,
    CAM_SENSITIVITY: 0.0034,
    PITCH_MIN: -0.4,     // rad (見上げ限界)
    PITCH_MAX: 1.25,     // rad (見下ろし限界)
  },

  // 昼夜サイクル
  DAY: {
    LENGTH_SEC: 240,   // 1日の実時間 (秒)
    START: 0.34,       // 開始時刻 (0=深夜0時, 0.5=正午)
  },

  // チャンクごとの風景
  SCENERY: {
    TREES_PER_CHUNK: 22,
    ROCKS_PER_CHUNK: 7,
    FLOWERS_PER_CHUNK: 34,
    CRYSTALS_PER_CHUNK: 2,
    PINE_RATIO: 0.45,    // 木のうち松の割合
    SAKURA_RATIO: 0.12,  // 木のうち桜の割合
    TREE_MAX_HEIGHT: 11, // この標高より上に木は生えない
    TREE_MAX_SLOPE: 1.2,
  },

  // 生き物
  CREATURES: {
    RABBITS: 12,
    ROAM_RADIUS: 90,     // スポーン地点からの行動範囲
    FLEE_DIST: 6,        // プレイヤーがこの距離まで来ると逃げる
    SLEEP_DIST: 220,     // プレイヤーがこれ以上遠いと更新停止
  },

  PICKUP_DIST: 1.8,      // クリスタル取得距離
};
