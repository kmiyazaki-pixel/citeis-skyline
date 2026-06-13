// =====================================================
//  セーブ - localStorage に進行状況を永続化
//   位置/視点・資材(木材/石)・道具・解放能力・構造物・時刻を保存
// =====================================================

import { state } from './state.js';
import { resetChunks } from './world.js';
import { spawnAllStructures } from './structures.js';

const KEY = 'komorebi-save-v2';

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
      v: 2,
      pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
      yaw: p.yaw,
      pitch: p.pitch,
      wood: state.wood,
      stone: state.stone,
      gatheredTotal: state.gatheredTotal,
      toolLevel: state.toolLevel,
      abilities: { ...state.abilities },
      timeOfDay: state.timeOfDay,
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
  if (typeof data.wood === 'number') state.wood = data.wood;
  if (typeof data.stone === 'number') state.stone = data.stone;
  if (typeof data.gatheredTotal === 'number') state.gatheredTotal = data.gatheredTotal;
  if (typeof data.toolLevel === 'number') state.toolLevel = data.toolLevel;
  if (data.abilities) Object.assign(state.abilities, data.abilities);
  if (typeof data.timeOfDay === 'number') state.timeOfDay = data.timeOfDay;
  state.structures = Array.isArray(data.structures) ? data.structures : [];

  resetChunks();        // 新しい位置の周囲を作り直す
  spawnAllStructures(); // 設置済みの拠点を復元
  return true;
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (_) { /* noop */ }
}
