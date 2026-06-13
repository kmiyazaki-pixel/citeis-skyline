// =====================================================
//  HUD - 画面上の情報表示とタイトル画面
// =====================================================

import * as THREE from 'three';
import { state } from './state.js';
import { initAudio } from './audio.js';
import { isTouch, camera } from './engine.js';
import { hasSave, loadAndApply, clearSave, save } from './save.js';
import { saveSettings, applySettings } from './settings.js';
import { nearestCrystal } from './world.js';
import { CONFIG } from './config.js';
import { toggleBuildMode, placeStructure } from './build.js';

const $crystal = document.getElementById('crystalCount');
const $clock = document.getElementById('clock');
const $compass = document.getElementById('compass');
const $hint = document.getElementById('hint');
const $title = document.getElementById('title');
const $hud = document.getElementById('hud');
const $app = document.getElementById('app');
const $banner = document.getElementById('banner');
const $objective = document.getElementById('objective');
const $objArrow = document.getElementById('objArrow');
const $objDist = document.getElementById('objDist');
const $staminaWrap = document.getElementById('staminaWrap');
const $staminaBar = document.getElementById('staminaBar');
const $buildBtn = document.getElementById('buildBtn');
const $placeBtn = document.getElementById('placeBtn');
const $buildHint = document.getElementById('buildHint');

const _proj = new THREE.Vector3();

const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];

export function setupHUD() {
  if (isTouch) {
    $hint.textContent = '左下スティック: 移動 ・ 画面ドラッグ: 視点 ・ 右下: ジャンプ';
  }
  const begin = () => {
    if (state.started) return;
    state.started = true;
    // タイトル画面中に押された Space などの幽霊ジャンプを消す
    state.input.jumpQueued = false;
    state.input.jumpBufferT = 0;
    initAudio(); // ユーザー操作のタイミングで AudioContext を作る
    $title.classList.add('hidden');
    $hud.classList.add('visible');
  };
  const newGame = () => { clearSave(); begin(); };
  const continueGame = () => { loadAndApply(); begin(); };

  const $start = document.getElementById('startBtn');
  const $continue = document.getElementById('continueBtn');
  // セーブがあれば「つづきから」を出す
  if (hasSave()) $continue.classList.remove('hidden');

  $start.addEventListener('click', newGame);
  $start.addEventListener('touchend', (e) => { e.preventDefault(); newGame(); }, { passive: false });
  $continue.addEventListener('click', continueGame);
  $continue.addEventListener('touchend', (e) => { e.preventDefault(); continueGame(); }, { passive: false });

  // ハイブリッド端末: 実際にタッチされたらヒントをタッチ用に切り替え
  window.addEventListener('touchstart', () => {
    $hint.textContent = '左下スティック: 移動 ・ 画面ドラッグ: 視点 ・ 右下: ジャンプ';
  }, { once: true });
}

// 画面中央上にメッセージを表示 (能力解放など)
export function showBanner(text) {
  $banner.textContent = text;
  $banner.classList.remove('show');
  void $banner.offsetWidth; // アニメ再start用にreflow
  $banner.classList.add('show');
}

// ---------- 一時停止 + 設定パネル ----------
const $pause = document.getElementById('pause');

export function togglePause() {
  if (!state.started) return;
  setPaused(!state.paused);
}

function setPaused(on) {
  state.paused = on;
  $pause.classList.toggle('hidden', !on);
  if (on && document.exitPointerLock) document.exitPointerLock();
}

export function setupPause() {
  const s = state.settings;
  // スライダー: [id, settingKey, 表示倍率(%表示なら100), ラベルid, suffix]
  const sliders = [
    ['volMaster', 'volMaster', 100, 'volMasterVal', '%'],
    ['volSfx', 'volSfx', 100, 'volSfxVal', '%'],
    ['volAmbience', 'volAmbience', 100, 'volAmbienceVal', '%'],
    ['volMusic', 'volMusic', 100, 'volMusicVal', '%'],
    ['sensitivity', 'sensitivity', 100, 'sensVal', ''],
  ];
  for (const [id, key, mul, labelId, suf] of sliders) {
    const el = document.getElementById(id);
    const lab = document.getElementById(labelId);
    const reflect = () => {
      lab.textContent = suf === '%' ? Math.round(s[key] * 100) + '%' : s[key].toFixed(1);
    };
    el.value = Math.round(s[key] * mul);
    reflect();
    el.addEventListener('input', () => {
      s[key] = el.value / mul;
      reflect();
      applySettings();
      saveSettings();
    });
  }
  const invertY = document.getElementById('invertY');
  const shadows = document.getElementById('shadows');
  invertY.checked = s.invertY;
  shadows.checked = s.shadows;
  invertY.addEventListener('change', () => { s.invertY = invertY.checked; saveSettings(); });
  shadows.addEventListener('change', () => { s.shadows = shadows.checked; applySettings(); saveSettings(); });

  document.getElementById('howto').textContent = isTouch
    ? '左下スティック: 移動 / 強く倒す: ダッシュ ・ 画面ドラッグ: 視点 ・ 右下: ジャンプ(長押しでグライド)'
    : 'WASD/矢印: 移動 ・ ドラッグ/ロック: 視点 ・ Space: ジャンプ(長押しでグライド) ・ Shift: ダッシュ ・ Esc: 一時停止';

  document.getElementById('pauseBtn').addEventListener('click', () => togglePause());
  // 拠点づくり
  $buildBtn.addEventListener('click', () => toggleBuildMode());
  $buildBtn.addEventListener('touchend', (e) => { e.preventDefault(); toggleBuildMode(); }, { passive: false });
  $placeBtn.addEventListener('click', () => placeStructure());
  $placeBtn.addEventListener('touchend', (e) => { e.preventDefault(); placeStructure(); }, { passive: false });
  document.getElementById('resumeBtn').addEventListener('click', () => setPaused(false));
  document.getElementById('toTitleBtn').addEventListener('click', () => {
    save();
    location.reload(); // タイトルへ (つづきから で復帰できる)
  });
}

// クリスタル取得時、その位置に「+1」を浮かせる
export function showPickupPopup(worldPos) {
  _proj.set(worldPos.x, worldPos.y, worldPos.z).project(camera);
  if (_proj.z > 1) return; // カメラ後方は出さない
  const x = (_proj.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
  const el = document.createElement('div');
  el.className = 'pickup-pop';
  el.textContent = '+1';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  $app.appendChild(el);
  setTimeout(() => el.remove(), 850);
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

  // 目標トラッカー: 最寄りクリスタルの方向へ矢印を回す
  const nc = nearestCrystal(state.player.pos);
  if (nc) {
    $objective.classList.remove('hidden');
    // 画面上で「上=カメラ前方」になるよう補正 (前方のワールド角は yaw+π)
    const rel = nc.angle - state.player.yaw - Math.PI;
    $objArrow.style.transform = `rotate(${rel}rad)`;
    $objDist.textContent = nc.dist < 1000 ? Math.round(nc.dist) + 'm' : '';
  } else {
    $objective.classList.add('hidden');
  }

  // スタミナバー (満タン時は隠す)
  const st = state.player.stamina / CONFIG.PLAYER.STAMINA_MAX;
  $staminaBar.style.width = (st * 100) + '%';
  $staminaWrap.classList.toggle('show', st < 0.999);

  // 拠点づくりモードの表示
  $buildBtn.classList.toggle('active', state.buildMode);
  $placeBtn.classList.toggle('hidden', !state.buildMode);
  $buildHint.classList.toggle('hidden', !state.buildMode);
  if (state.buildMode) {
    const cost = CONFIG.BUILD.KITS.foundation.cost;
    const ok = state.crystals >= cost;
    $buildHint.textContent = ok
      ? `土台を設置 (資材 ${cost}) ・ 手持ち 💎${state.crystals}`
      : `資材が足りません (必要 ${cost} / 手持ち ${state.crystals})`;
  }
}
