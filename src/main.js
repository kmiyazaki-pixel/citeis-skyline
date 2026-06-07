// =====================================================
//  エントリポイント - 入力処理とゲームループ
// =====================================================

import { state } from './state.js';
import { CONFIG } from './config.js';
import { $canvas } from './dom.js';
import { placeTile } from './grid.js';
import { setupCanvas, render, screenToTile } from './renderer.js';
import { setupTools } from './tools.js';
import { simulationTick } from './simulation.js';
import { updateStatusBar } from './ui.js';

// =====================================================
//  入力 - ドラッグで連続設置 (ヒットテストは renderer に委譲)
// =====================================================
let isPainting = false;
let lastPainted = { x: -1, y: -1 };

function handlePointer(e) {
  e.preventDefault();
  const { x, y } = screenToTile(e);
  if (x < 0) return; // 範囲外 / 未ヒット
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
//   hidden tab で rAF が止まるブラウザ向けに setTimeout フォールバック
// =====================================================
function scheduleNextFrame() {
  if (document.hidden) {
    setTimeout(() => gameLoop(performance.now()), 100);
  } else {
    requestAnimationFrame(gameLoop);
  }
}

function gameLoop(now) {
  if (now - state.lastTick > CONFIG.TICK_INTERVAL) {
    state.lastTick = now;
    simulationTick();
    updateStatusBar();
  }
  render();
  scheduleNextFrame();
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
  scheduleNextFrame();
}

init();
