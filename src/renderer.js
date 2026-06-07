// =====================================================
//  描画 - Canvas に全タイルを描く
// =====================================================

import { state } from './state.js';
import { CONFIG } from './config.js';
import { $canvas } from './dom.js';
import { mixHex } from './utils.js';

const ctx = $canvas.getContext('2d');

// CSS変数から色を取得
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let colors = null;
function loadColors() {
  colors = {
    grass:            cssVar('--grass'),
    grassShadow:      cssVar('--grass-shadow'),
    road:             cssVar('--road'),
    roadLine:         cssVar('--road-line'),
    residential:      cssVar('--residential'),
    residentialLight: cssVar('--residential-light'),
    gridLine:         cssVar('--grid-line'),
  };
}

// Canvas サイズを設定 (グリッドサイズ × タイルサイズ)
export function setupCanvas() {
  const w = CONFIG.GRID.WIDTH  * CONFIG.GRID.TILE_SIZE;
  const h = CONFIG.GRID.HEIGHT * CONFIG.GRID.TILE_SIZE;
  $canvas.width  = w;
  $canvas.height = h;
  loadColors();
}

// 全タイルを描画
export function render() {
  if (!colors) loadColors();

  for (let y = 0; y < CONFIG.GRID.HEIGHT; y++) {
    for (let x = 0; x < CONFIG.GRID.WIDTH; x++) {
      drawTile(x, y, state.grid[y][x]);
    }
  }

  drawGridLines();
}

function drawTile(x, y, tile) {
  const ts = CONFIG.GRID.TILE_SIZE;
  const px = x * ts;
  const py = y * ts;

  if (tile.type === 'empty') {
    // 草地 + 模様
    ctx.fillStyle = colors.grass;
    ctx.fillRect(px, py, ts, ts);
    // タイルごとに固定の擬似ランダム模様
    const seed = (x * 73 + y * 137) % 11;
    if (seed < 3) {
      ctx.fillStyle = colors.grassShadow;
      ctx.fillRect(px + (seed * 3 + 2), py + (seed + 4), 2, 2);
    }
  } else if (tile.type === 'road') {
    ctx.fillStyle = colors.road;
    ctx.fillRect(px, py, ts, ts);
    // 中央の白い点 (簡易な道路マーク)
    ctx.fillStyle = colors.roadLine;
    ctx.fillRect(px + ts / 2 - 1, py + ts / 2 - 1, 2, 2);
  } else if (tile.type === 'residential') {
    // 人口に応じて色を補間 (淡い→濃い)
    const occupancy = tile.population / CONFIG.RESIDENTIAL.CAPACITY;
    ctx.fillStyle = mixHex(colors.residentialLight, colors.residential, occupancy);
    ctx.fillRect(px, py, ts, ts);

    // 屋根の影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(px + 2, py + 2, ts - 4, 4);

    // 窓 (中央)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(px + ts / 2 - 2, py + ts / 2 + 2, 4, 4);
  }
}

function drawGridLines() {
  const ts = CONFIG.GRID.TILE_SIZE;
  ctx.strokeStyle = colors.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= CONFIG.GRID.WIDTH; i++) {
    ctx.moveTo(i * ts + 0.5, 0);
    ctx.lineTo(i * ts + 0.5, CONFIG.GRID.HEIGHT * ts);
  }
  for (let i = 0; i <= CONFIG.GRID.HEIGHT; i++) {
    ctx.moveTo(0, i * ts + 0.5);
    ctx.lineTo(CONFIG.GRID.WIDTH * ts, i * ts + 0.5);
  }
  ctx.stroke();
}
