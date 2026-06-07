// =====================================================
//  シミュレーション - 人口成長と税収の計算 (1tick単位)
// =====================================================

import { state } from './state.js';
import { CONFIG } from './config.js';
import { isAdjacentToRoad } from './grid.js';

// 1tick の処理 (TICK_INTERVAL ごとに呼ばれる)
export function simulationTick() {
  let totalPop = 0;

  for (let y = 0; y < CONFIG.GRID.HEIGHT; y++) {
    for (let x = 0; x < CONFIG.GRID.WIDTH; x++) {
      const tile = state.grid[y][x];
      if (tile.type !== 'residential') continue;

      if (isAdjacentToRoad(x, y)) {
        // 道路に隣接していれば成長
        tile.population = Math.min(
          CONFIG.RESIDENTIAL.CAPACITY,
          tile.population + CONFIG.RESIDENTIAL.GROWTH_PER_TICK
        );
      } else {
        // 道路がないと衰退
        tile.population = Math.max(
          0,
          tile.population - CONFIG.RESIDENTIAL.DECAY_PER_TICK
        );
      }
      totalPop += tile.population;
    }
  }

  state.population = totalPop;
  // 税収: 人口に比例
  state.cash += totalPop * CONFIG.TAX_PER_PERSON_PER_TICK;
}
