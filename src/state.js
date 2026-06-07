// =====================================================
//  ゲーム状態 - 実行中に変化する値はぜんぶここ
// =====================================================

import { CONFIG } from './config.js';

// 空のグリッドを作る (2D配列)
function makeEmptyGrid(w, h) {
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      row.push({ type: 'empty', population: 0 });
    }
    grid.push(row);
  }
  return grid;
}

export const state = {
  // 資源
  cash: CONFIG.STARTING_CASH,
  population: 0,

  // ワールド
  //   grid[y][x] = { type: 'empty'|'road'|'residential'|'plaza', population: number }
  //   plaza は装飾タイルでシミュには反応しない
  grid: makeEmptyGrid(CONFIG.GRID.WIDTH, CONFIG.GRID.HEIGHT),

  // 現在選択中のツール
  selectedTool: 'road',

  // タイミング
  lastTick: 0,
};
