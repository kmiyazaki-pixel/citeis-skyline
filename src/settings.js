// =====================================================
//  設定 - localStorage 永続化 + 各システムへの適用
//   state.settings が真実。ここは入出力と反映だけを担う
// =====================================================

import { state } from './state.js';
import { lights, renderer, isMobile } from './engine.js';
import { setVolume } from './audio.js';

const KEY = 'komorebi-settings-v1';

export function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (data) Object.assign(state.settings, data);
  } catch (_) { /* 既定値のまま */ }
}

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.settings));
  } catch (_) { /* noop */ }
}

// 設定を実際のシステムへ反映する
export function applySettings() {
  const s = state.settings;
  setVolume('master', s.volMaster);
  setVolume('sfx', s.volSfx);
  setVolume('ambience', s.volAmbience);
  // BGM 音量は audio 側で music バスに反映 (Tier 2-C)
  setVolume('music', s.volMusic);
  // 影 (モバイルは元々オフなので尊重)
  if (renderer) {
    renderer.shadowMap.enabled = s.shadows && !isMobile;
    if (lights.sun) lights.sun.castShadow = s.shadows && !isMobile;
  }
}
