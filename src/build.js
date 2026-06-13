// =====================================================
//  ビルド - 拠点づくりモード
//   ・トグルでゴーストを表示、プレイヤー前方の地面に追従
//   ・資材 (crystals) が足りて傾斜が緩ければ設置できる
//   ・設置は state.structures に push してセーブ
// =====================================================

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { scene } from './engine.js';
import { heightAt } from './world.js';
import { addStructureMesh, makeGhost } from './structures.js';
import { save } from './save.js';
import { playPickup } from './audio.js';

let ghost = null;
let ghostType = 'foundation';
let canPlace = false;

const _green = new THREE.Color(0x66dd77);
const _red = new THREE.Color(0xdd5555);

function ensureGhost() {
  if (!ghost) {
    ghost = makeGhost(ghostType);
    ghost.visible = false;
    scene.add(ghost);
  }
}

export function setupBuild() {
  ensureGhost();
}

// 拠点モードの ON/OFF
export function toggleBuildMode() {
  if (!state.started) return;
  state.buildMode = !state.buildMode;
  ensureGhost();
  ghost.visible = state.buildMode;
}

export function isBuildMode() {
  return state.buildMode;
}

// 前方の設置候補点 (グリッド吸着)
function targetSpot() {
  const p = state.player;
  // カメラ→プレイヤーの逆 = 前方
  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);
  const gx = CONFIG.BUILD.GRID;
  let x = p.pos.x + fx * CONFIG.BUILD.PLACE_DIST;
  let z = p.pos.z + fz * CONFIG.BUILD.PLACE_DIST;
  x = Math.round(x / gx) * gx;
  z = Math.round(z / gx) * gx;
  return { x, z };
}

function slopeAt(x, z) {
  const h = heightAt(x, z);
  const e = 1.0;
  return Math.abs(heightAt(x + e, z) - h) + Math.abs(heightAt(x, z + e) - h);
}

export function updateBuild(dt) {
  if (!state.buildMode || !ghost) {
    if (ghost) ghost.visible = false;
    return;
  }
  ghost.visible = true;
  const { x, z } = targetSpot();
  ghost.position.set(x, heightAt(x, z), z);

  const cost = CONFIG.BUILD.KITS[ghostType].cost;
  const affordable = state.crystals >= cost;
  const flat = slopeAt(x, z) <= CONFIG.BUILD.MAX_SLOPE;
  const aboveWater = heightAt(x, z) > CONFIG.WATER_LEVEL + 0.2;
  canPlace = affordable && flat && aboveWater;

  const tint = canPlace ? _green : _red;
  ghost.traverse((o) => { if (o.material) o.material.color.copy(tint); });
}

// 設置を実行 (設置できたら true)
export function placeStructure() {
  if (!state.buildMode || !canPlace) return false;
  const { x, z } = targetSpot();
  const cost = CONFIG.BUILD.KITS[ghostType].cost;
  state.crystals -= cost;
  const data = {
    id: 'st_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4),
    type: ghostType,
    x, z, rot: state.player.yaw,
  };
  state.structures.push(data);
  addStructureMesh(data);
  playPickup();
  save();
  return true;
}
