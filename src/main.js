// =====================================================
//  エントリポイント - 入力処理とゲームループ
// =====================================================

import { state } from './state.js';
import { CONFIG } from './config.js';
import { $canvas } from './dom.js';
import { placeTile } from './grid.js';
import { setupCanvas, render } from './renderer.js';
import { setupTools } from './tools.js';
import { simulationTick } from './simulation.js';
import { updateStatusBar } from './ui.js';

// =====================================================
//  入力 - マウス/タッチ座標をタイル座標に変換
// =====================================================
function eventToTile(e) {
  const rect = $canvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  // Canvas の論理サイズと表示サイズの比率を考慮
  const scaleX = $canvas.width  / rect.width;
  const scaleY = $canvas.height / rect.height;
  const px = (point.clientX - rect.left) * scaleX;
  const py = (point.clientY - rect.top)  * scaleY;
  return {
    x: Math.floor(px / CONFIG.GRID.TILE_SIZE),
    y: Math.floor(py / CONFIG.GRID.TILE_SIZE),
  };
}

// ドラッグで連続設置できるように、最後に置いたタイルを覚えておく
let isPainting = false;
let lastPainted = { x: -1, y: -1 };

function handlePointer(e) {
  e.preventDefault();
  const { x, y } = eventToTile(e);
  if (x === lastPainted.x && y === lastPainted.y) return;
  lastPainted = { x, y };
  placeTile(x, y, state.selectedTool);
}

function setupInput() {
  // マウス
  $canvas.addEventListener('mousedown', (e) => {
    isPainting = true;
    lastPainted = { x: -1, y: -1 };
    handlePointer(e);
  });
  $canvas.addEventListener('mousemove', (e) => {
    if (isPainting) handlePointer(e);
  });
  window.addEventListener('mouseup', () => { isPainting = false; });

  // タッチ (スマホ対応)
  $canvas.addEventListener('touchstart', (e) => {
    isPainting = true;
    lastPainted = { x: -1, y: -1 };
    handlePointer(e);
  }, { passive: false });
  $canvas.addEventListener('touchmove', (e) => {
    if (isPainting) handlePointer(e);
  }, { passive: false });
  $canvas.addEventListener('touchend', () => { isPainting = false; });
}

// =====================================================
//  ゲームループ
// =====================================================
function gameLoop(now) {
  // 一定間隔でシミュレーション (tickベース)
  if (now - state.lastTick > CONFIG.TICK_INTERVAL) {
    state.lastTick = now;
    simulationTick();
    updateStatusBar();
  }

  // 描画は毎フレーム
  render();

  requestAnimationFrame(gameLoop);
}

// =====================================================
//  初期化
// =====================================================
function init() {
  setupCanvas();
  setupTools();
  setupInput();
  updateStatusBar();

  state.lastTick = performance.now();
  requestAnimationFrame(gameLoop);
}

init();
