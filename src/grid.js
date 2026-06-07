// =====================================================
//  グリッド操作 - タイルの取得・設置・接続判定
// =====================================================

import { state } from './state.js';
import { CONFIG } from './config.js';
import { neighbors4 } from './utils.js';

// タイルを取得 (範囲外は null)
export function getTile(x, y) {
  if (x < 0 || y < 0 || x >= CONFIG.GRID.WIDTH || y >= CONFIG.GRID.HEIGHT) return null;
  return state.grid[y][x];
}

// タイルを設置する
// 戻り値: 成功なら true / お金不足・既に同じものがあるなどで false
export function placeTile(x, y, tool) {
  const tile = getTile(x, y);
  if (!tile) return false;

  // 取り壊し
  if (tool === 'demolish') {
    if (tile.type === 'empty') return false;
    tile.type = 'empty';
    tile.population = 0;
    return true;
  }

  // 同じものを置こうとしている / 既に何かある
  if (tile.type === tool) return false;
  if (tile.type !== 'empty') return false;

  // お金チェック
  const cost = CONFIG.COST[tool];
  if (state.cash < cost) return false;

  state.cash -= cost;
  tile.type = tool;
  tile.population = 0;
  return true;
}

// 指定タイルが道路に隣接しているか
export function isAdjacentToRoad(x, y) {
  for (const { tile } of neighbors4(state.grid, x, y)) {
    if (tile.type === 'road') return true;
  }
  return false;
}
