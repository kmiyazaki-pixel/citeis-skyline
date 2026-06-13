// =====================================================
//  HUD - 画面上の情報表示とタイトル画面
// =====================================================

import { state } from './state.js';
import { initAudio } from './audio.js';
import { isTouch } from './engine.js';

const $crystal = document.getElementById('crystalCount');
const $clock = document.getElementById('clock');
const $compass = document.getElementById('compass');
const $hint = document.getElementById('hint');
const $title = document.getElementById('title');
const $hud = document.getElementById('hud');

const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];

export function setupHUD() {
  if (isTouch) {
    $hint.textContent = '左下スティック: 移動 ・ 画面ドラッグ: 視点 ・ 右下: ジャンプ';
  }
  const start = () => {
    if (state.started) return;
    state.started = true;
    // タイトル画面中に押された Space などの幽霊ジャンプを消す
    state.input.jumpQueued = false;
    state.input.jumpBufferT = 0;
    initAudio(); // ユーザー操作のタイミングで AudioContext を作る
    $title.classList.add('hidden');
    $hud.classList.add('visible');
  };
  document.getElementById('startBtn').addEventListener('click', start);
  // touchstart はユーザーアクティベーション扱いにならず AudioContext が
  // suspended のままになるため、touchend で開始する
  document.getElementById('startBtn').addEventListener('touchend', (e) => {
    e.preventDefault(); // 合成 click を抑止して二重起動を防ぐ
    start();
  }, { passive: false });
  // ハイブリッド端末: 実際にタッチされたらヒントをタッチ用に切り替え
  window.addEventListener('touchstart', () => {
    $hint.textContent = '左下スティック: 移動 ・ 画面ドラッグ: 視点 ・ 右下: ジャンプ';
  }, { once: true });
}

export function updateHUD() {
  $crystal.textContent = '💎 ' + state.crystals;

  // 時計 (timeOfDay 0..1 → HH:MM)
  const mins = Math.floor(state.timeOfDay * 24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  const icon = state.timeOfDay > 0.27 && state.timeOfDay < 0.73 ? '☀️' : '🌙';
  $clock.textContent = `${icon} ${hh}:${mm}`;

  // コンパス (カメラの向いている方角)
  const heading = ((-state.player.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const idx = Math.round(heading / (Math.PI / 4)) % 8;
  $compass.textContent = DIRS[idx];
}
