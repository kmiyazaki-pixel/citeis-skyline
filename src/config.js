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
    STAMINA_MAX: 100,
    STAMINA_DRAIN: 30,   // ダッシュ中の毎秒消費
    STAMINA_REGEN: 24,   // 非ダッシュ時の毎秒回復
    STAMINA_MIN_RUN: 8,  // この値を超えるまで再ダッシュ不可 (息切れ)
    JUMP_SPEED: 7.5,
    DOUBLE_JUMP_SPEED: 6.5, // 2段目ジャンプ
    GRAVITY: 20,
    GLIDE_FALL: 2.2,     // 滑空中の最大降下速度
    SWIM_RISE: 2.5,      // 泳ぎ: 水面へ浮く速さ
    JUMP_BUFFER: 0.15,   // 着地直前のジャンプ入力を生かす猶予 (秒)
    SNAP_DOWN: 0.45,     // 下り坂で地面に吸着する最大段差 (接地の揺れ防止)
    TURN_LERP: 10,       // アバターの向き追従の速さ
    CAM_DISTANCE: 7,
    CAM_HEIGHT: 2.6,
    CAM_SENSITIVITY: 0.0034,
    PITCH_MIN: -0.4,     // rad (見上げ限界)
    PITCH_MAX: 1.25,     // rad (見下ろし限界)
    CAM_LERP: 9,         // カメラ位置の遅延追従の速さ (大きいほど機敏)
    FOV_BASE: 60,        // 通常の視野角
    FOV_DASH: 66,        // ダッシュ中の視野角 (スピード感)
    FOV_LERP: 6,         // 視野角の補間速度
    LAND_DIP: 0.32,      // 着地時にカメラが沈む量
    LAND_DIP_RECOVER: 6, // 着地沈み込みの戻る速さ
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

  PICKUP_DIST: 1.6,      // クリスタル取得距離
  MAGNET_DIST: 4.5,      // この距離まで近づくとクリスタルが吸い寄せられる
  MAGNET_SPEED: 9,       // 吸い寄せの速さ

  // 進行: クリスタル収集数で能力を解放
  PROGRESSION: {
    DOUBLE_JUMP: 5,   // 2段ジャンプ
    GLIDE: 15,        // 滑空 (ジャンプ長押しでゆっくり降下)
    SWIM: 30,         // 泳ぎ (水面に浮く)
  },
};
