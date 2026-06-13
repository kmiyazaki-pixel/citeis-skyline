// =====================================================
//  入力 - キーボード / マウスドラッグ / タッチ
//   state.input に書き込み、player.js が消費する
//   タッチUIの DOM (ジョイスティック円) は表示専用で、
//   タッチイベントはすべて canvas 側で処理する
// =====================================================

import { state } from './state.js';
import { isTouch } from './engine.js';
import { togglePause } from './hud.js';
import { toggleBuildMode, placeStructure, isBuildMode, cycleKit } from './build.js';
import { tryGather, upgradeTool } from './gather.js';

const keys = new Set();
let dragging = false;
let lastX = 0, lastY = 0;
let downX = 0, downY = 0;

// タッチ: ジョイスティック用と視点用を指 ID で区別
let joyTouchId = null;
let lookTouchId = null;
let joyOrigin = { x: 0, y: 0 };

export function setupInput(canvas) {
  // ---------- キーボード ----------
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'Escape') { togglePause(); return; }
    if (e.code === 'KeyB' && state.started) { toggleBuildMode(); return; }
    if (e.code === 'KeyE' && state.started) {
      if (isBuildMode()) placeStructure(); else tryGather();
      return;
    }
    if ((e.code === 'KeyQ' || e.code === 'KeyTab') && isBuildMode()) {
      e.preventDefault();
      cycleKit(1);
      return;
    }
    if (e.code === 'Space' && !keys.has('Space') && state.started) {
      state.input.jumpQueued = true;
      state.input.jumpHeld = true;
    }
    keys.add(e.code);
    updateMoveFromKeys();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') state.input.jumpHeld = false;
    keys.delete(e.code);
    updateMoveFromKeys();
  });
  window.addEventListener('blur', () => {
    keys.clear();
    dragging = false; // フォーカス喪失中の mouseup を取り逃しても引きずらない
    state.input.jumpHeld = false;
    updateMoveFromKeys();
  });

  // ---------- マウスドラッグで視点 ----------
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    lastX = downX = e.clientX;
    lastY = downY = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      state.input.lookDX += e.movementX;
      state.input.lookDY += e.movementY;
    } else if (dragging) {
      state.input.lookDX += e.clientX - lastX;
      state.input.lookDY += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });
  window.addEventListener('mouseup', () => { dragging = false; });

  // クリックでポインターロック。ドラッグ後の click は無視する。
  // タッチ端末では canvas touchstart の preventDefault が click を抑止するので無害
  canvas.addEventListener('click', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return; // ドラッグだった
    if (isBuildMode()) { placeStructure(); return; } // ビルド中のクリックは設置
    if (state.started && document.pointerLockElement === canvas) { tryGather(); return; } // ロック中のクリックは採取
    if (state.started && document.pointerLockElement !== canvas) {
      try {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch (_) { /* 未対応環境は無視 */ }
    }
  });

  // ---------- タッチ ----------
  const joystick = document.getElementById('joystick');
  const stick = document.getElementById('stick');
  const jumpBtn = document.getElementById('jumpBtn');

  const showTouchUI = () => {
    joystick.classList.add('visible');
    jumpBtn.classList.add('visible');
  };
  if (isTouch) showTouchUI(); // 初期推定 (スマホ/タブレット)
  // タッチ液晶ノートPCなどは実際にタッチされた時に表示
  window.addEventListener('touchstart', showTouchUI, { once: true });

  // 拠点づくり / 採取のボタン (クリック + タッチ両対応)
  const tapBtn = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', fn);
    el.addEventListener('touchend', (e) => { e.preventDefault(); fn(); }, { passive: false });
  };
  tapBtn('buildBtn', () => toggleBuildMode());
  tapBtn('placeBtn', () => placeStructure());
  tapBtn('gatherBtn', () => tryGather());
  tapBtn('toolBtn', () => upgradeTool());
  tapBtn('kitPrev', () => cycleKit(-1));
  tapBtn('kitNext', () => cycleKit(1));

  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (state.started) {
      state.input.jumpQueued = true;
      state.input.jumpHeld = true;
    }
  }, { passive: false });
  const jumpRelease = (e) => { e.preventDefault(); state.input.jumpHeld = false; };
  jumpBtn.addEventListener('touchend', jumpRelease, { passive: false });
  jumpBtn.addEventListener('touchcancel', jumpRelease, { passive: false });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      // 画面左下 45% はジョイスティック、それ以外は視点
      if (joyTouchId === null && t.clientX < window.innerWidth * 0.45 && t.clientY > window.innerHeight * 0.4) {
        joyTouchId = t.identifier;
        joyOrigin = { x: t.clientX, y: t.clientY };
        // ベース円を指の位置に動かして、見た目と入力原点を一致させる
        joystick.style.left = (t.clientX - 60) + 'px';
        joystick.style.top = (t.clientY - 60) + 'px';
        joystick.style.bottom = 'auto';
      } else if (lookTouchId === null) {
        lookTouchId = t.identifier;
        lastX = t.clientX;
        lastY = t.clientY;
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyTouchId) {
        const dx = t.clientX - joyOrigin.x;
        const dy = t.clientY - joyOrigin.y;
        const max = 50;
        const cx = Math.max(-max, Math.min(max, dx));
        const cy = Math.max(-max, Math.min(max, dy));
        state.input.move.x = cx / max;
        state.input.move.z = -cy / max; // 上スワイプ = 前進
        stick.style.transform = `translate(calc(-50% + ${cx * 0.6}px), calc(-50% + ${cy * 0.6}px))`;
        // 強く倒したらダッシュ
        state.input.running = Math.hypot(cx, cy) > max * 0.85;
      } else if (t.identifier === lookTouchId) {
        state.input.lookDX += t.clientX - lastX;
        state.input.lookDY += t.clientY - lastY;
        lastX = t.clientX;
        lastY = t.clientY;
      }
    }
  }, { passive: false });

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyTouchId) {
        joyTouchId = null;
        state.input.move.x = 0;
        state.input.move.z = 0;
        state.input.running = false;
        stick.style.transform = 'translate(-50%, -50%)';
        // ベース円を CSS の定位置に戻す
        joystick.style.left = '';
        joystick.style.top = '';
        joystick.style.bottom = '';
        updateMoveFromKeys(); // 押しっぱなしのキーがあれば即反映
      } else if (t.identifier === lookTouchId) {
        lookTouchId = null;
      }
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);
}

function updateMoveFromKeys() {
  if (joyTouchId !== null) return; // ジョイスティック操作中はキーボードで上書きしない
  let x = 0, z = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  state.input.move.x = x;
  state.input.move.z = z;
  state.input.running = keys.has('ShiftLeft') || keys.has('ShiftRight');
}
