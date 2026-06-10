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
//   rAF と setTimeout を両方仕掛けて先に発火した方が駆動する。
//   可視タブ: rAF が先 (60fps)。hidden タブ: rAF は止まるので
//   setTimeout が保険として動き続ける。visibility が切り替わる
//   瞬間に rAF 待ちで永久停止する事故をこれで防ぐ
// =====================================================
let rafId = 0;
let timeoutId = 0;

function scheduleNextFrame() {
  rafId = requestAnimationFrame(tick);
  timeoutId = setTimeout(tick, 150);
}

function tick() {
  cancelAnimationFrame(rafId);
  clearTimeout(timeoutId);
  gameLoop(performance.now());
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
