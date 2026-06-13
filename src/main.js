// =====================================================
//  エントリポイント - 初期化とゲームループ
// =====================================================

import { setupEngine, renderFrame } from './engine.js';
import { state } from './state.js';
import { initWorld, updateWorld } from './world.js';
import { setupPlayer, updatePlayer, updateTitleCamera } from './player.js';
import { setupInput } from './input.js';
import { setupSky, updateSky } from './sky.js';
import { setupCreatures, updateCreatures } from './creatures.js';
import { setupHUD, updateHUD, showPickupPopup } from './hud.js';
import { playPickup, updateAmbience } from './audio.js';

// ---------- エラーを画面に出す (スマホでのデバッグ補助) ----------
const $errToast = document.getElementById('errToast');
function showError(msg) {
  $errToast.textContent = String(msg).slice(0, 600);
  $errToast.classList.add('visible');
  console.error(msg);
}
window.addEventListener('error', (e) => showError(e.message + '\n' + (e.error && e.error.stack || '')));
window.addEventListener('unhandledrejection', (e) => showError('Promise: ' + (e.reason && e.reason.stack || e.reason)));

// ---------- ゲームループ ----------
//   rAF と setTimeout を両方仕掛けて先に発火した方が駆動する。
//   visibility 切替の瞬間に rAF 待ちで永久停止する事故を防ぐ
let rafId = 0;
let timeoutId = 0;
let lastNow = 0;

function scheduleNextFrame() {
  rafId = requestAnimationFrame(tick);
  timeoutId = setTimeout(tick, 150);
}

function tick() {
  cancelAnimationFrame(rafId);
  clearTimeout(timeoutId);
  frame(performance.now());
}

function frame(now) {
  const dt = Math.min((now - lastNow) / 1000, 0.05); // ワープ防止クランプ
  lastNow = now;

  // 空はタイトル画面でも動かす (背景演出)
  updateSky(dt, state.player.pos);

  if (!state.started) {
    // タイトル画面はワールドをゆっくり旋回して見せる
    updateTitleCamera(dt);
  } else {
    updatePlayer(dt);
    const picked = updateWorld(dt, state.player.pos);
    if (picked.length > 0) {
      state.crystals += picked.length;
      playPickup();
      for (const pos of picked) showPickupPopup(pos);
    }
    updateCreatures(dt, state.player.pos);
    updateAmbience(dt, state.timeOfDay);
    updateHUD();
  }

  renderFrame();
  scheduleNextFrame();
}

// ---------- 初期化 ----------
function init() {
  const canvas = document.getElementById('canvas');
  setupEngine(canvas);
  setupSky();
  setupPlayer();              // スポーン地点を確定 (world は heightAt だけ使う)
  initWorld(state.player.pos.x, state.player.pos.z);
  setupCreatures(state.player.pos.x, state.player.pos.z);
  setupInput(canvas);
  setupHUD();

  // 開発用フック (preview からの動作検証に使う。削除しないこと)
  window.__game = { state };

  // PWA: オフライン対応 (ホーム画面に追加して遊べる)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  lastNow = performance.now();
  scheduleNextFrame();
}

init();
