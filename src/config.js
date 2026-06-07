// =====================================================
//  数値定数 - バランス調整はここをいじる
// =====================================================

export const CONFIG = {
  // グリッド
  GRID: {
    WIDTH: 24,
    HEIGHT: 24,
    TILE_SIZE: 24,  // px (Canvas内の論理サイズ)
  },

  // タイル設置コスト ($)
  COST: {
    road: 20,
    residential: 50,
    plaza: 50,
    demolish: 0,
  },

  // 経済
  STARTING_CASH: 10000,
  TICK_INTERVAL: 500,  // ms ごとに 1tick

  // 住宅
  RESIDENTIAL: {
    CAPACITY: 4,            // 1タイルの最大人口
    GROWTH_PER_TICK: 0.25,  // 1tick あたりの成長 (要道路接続)
    DECAY_PER_TICK: 0.10,   // 道路無し時の衰退
  },

  // 税収
  TAX_PER_PERSON_PER_TICK: 0.04,

  // 広場 (装飾のみ。シミュには反応しない)
  PLAZA: {
    FOUNTAIN_PROBABILITY: 0.6, // 噴水 60% / ベンチ 40%
  },

  // 描画専用の装飾値 (シミュは絶対に読まない)
  VISUAL: {
    PALETTE: {
      WALLS:        ['#f0e6d2', '#e8e0d0', '#b8b0a8', '#a8b0b8', '#c8d4e0', '#d4b896', '#e8c8c8'],
      LOW_ROOFS:    ['#a8483a', '#6b4a32', '#5a5a5a'],
      HIGH_CROWNS:  ['#3a4a5c', '#5a6878', '#8a7a6a', '#2c3640'],
      WINDOW_LIT:   '#f4d488',
      WINDOW_DIM:   '#7a8590',
      SIDEWALK:     '#c4bdb2',
      SAKURA:       ['#f8b6c8', '#f4c2d0', '#e89bb4'],
      RIVER:        '#7aa8c4',
    },
    TIER: {
      LOW_MAX:   3,     // 低層: 1〜3階
      MID_MAX:   8,     // 中層: 4〜8階
      HIGH_MAX:  15,    // 高層: 9〜15階
      LOW_RATIO: 0.60,  // 全タイルの 60% を低層
      MID_RATIO: 0.30,  // 30% を中層
      STORY_H:   0.9,   // 1階分の高さ
    },
    DOWNTOWN_RADIUS:    6,    // 中心からこの距離内は高層出現率アップ
    SAKURA_RATIO:       0.25, // 街路樹のうち桜の割合
    STREETLIGHT_HEIGHT: 1.6,
    MAX_WINDOWS:        20000, // InstancedMesh の上限
  },
};
