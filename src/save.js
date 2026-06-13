// =====================================================
//  セーブ - localStorage に進行状況を永続化
//   位置/視点・収集数・解放能力・取得済みクリスタル・時刻を保存
// =====================================================

import { state } from './state.js';
import { getCollectedKeys, restoreCollected, resetChunks } from './world.js';
import { spawnAllStructures } from './structures.js';

const KEY = 'komorebi-save-v1';

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch (_) {
    return false;
  }
}

export function save() {
  try {
    const p = state.player;
    const data = {
      v: 1,
      pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
      yaw: p.yaw,
      pitch: p.pitch,
      crystals: state.crystals,
      crystalsTotal: state.crystalsTotal,
      abilities: { ...state.abilities },
      timeOfDay: state.timeOfDay,
      collected: getCollectedKeys(),
      structures: state.structures,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (_) { /* 容量超過等は無視 */ }
}

// セーブを読み込んで state とワールドへ適用する (つづきから)
export function loadAndApply() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (_) {
    data = null;
  }
  if (!data) return false;

  const p = state.player;
  if (data.pos) { p.pos.x = data.pos.x; p.pos.y = data.pos.y; p.pos.z = data.pos.z; }
  if (typeof data.yaw === 'number') p.yaw = data.yaw;
  if (typeof data.pitch === 'number') p.pitch = data.pitch;
  if (typeof data.crystals === 'number') state.crystals = data.crystals;
  if (typeof data.crystalsTotal === 'number') state.crystalsTotal = data.crystalsTotal;
  else if (typeof data.crystals === 'number') state.crystalsTotal = data.crystals; // 旧セーブ互換
  if (data.abilities) Object.assign(state.abilities, data.abilities);
  if (typeof data.timeOfDay === 'number') state.timeOfDay = data.timeOfDay;
  state.structures = Array.isArray(data.structures) ? data.structures : [];

  restoreCollected(data.collected);
  resetChunks(); // 取得済みを反映しつつ新しい位置の周囲を作り直す
  spawnAllStructures(); // 設置済みの拠点を復元
  return true;
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (_) { /* noop */ }
}
