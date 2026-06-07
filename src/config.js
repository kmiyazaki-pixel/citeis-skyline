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
};
