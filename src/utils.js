// =====================================================
//  ユーティリティ関数
// =====================================================

// 通貨表示 ($1,234 形式)
export function formatCash(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

// 人口表示 (カンマ区切り)
export function formatPop(n) {
  return Math.floor(n).toLocaleString('en-US');
}

// グリッドの4方向隣接タイル (上下左右)
export function neighbors4(grid, x, y) {
  const result = [];
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const w = grid[0].length, h = grid.length;
  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
      result.push({ x: nx, y: ny, tile: grid[ny][nx] });
    }
  }
  return result;
}

// 2色を補間 ('#rrggbb' 形式の文字列 a, b と t=0..1)
export function mixHex(aHex, bHex, t) {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  return [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16),
  ];
}
