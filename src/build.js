// =====================================================
//  ビルド - 拠点づくりモード
//   ・パレットで建てる物を選び、前方の地面にゴーストを表示
//   ・木材/石が足りて傾斜が緩ければ設置できる
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
let kitIndex = 0;           // CONFIG.BUILD.ORDER のインデックス
let canPlace = false;

const _green = new THREE.Color(0x66dd77);
const _red = new THREE.Color(0xdd5555);

function currentType() {
  return CONFIG.BUILD.ORDER[kitIndex];
}

function rebuildGhost() {
  if (ghost) { scene.remove(ghost); ghost = null; }
  ghost = makeGhost(currentType());
  ghost.visible = state.buildMode;
  scene.add(ghost);
}

export function setupBuild() {
  rebuildGhost();
}

export function toggleBuildMode() {
  if (!state.started) return;
  state.buildMode = !state.buildMode;
  if (!ghost) rebuildGhost();
  ghost.visible = state.buildMode;
}

export function isBuildMode() {
  return state.buildMode;
}

// パレットを切り替える (Q / ボタン)
export function cycleKit(dir) {
  const n = CONFIG.BUILD.ORDER.length;
  kitIndex = (kitIndex + dir + n) % n;
  rebuildGhost();
}

export function currentKitInfo() {
  const type = currentType();
  return { type, ...CONFIG.BUILD.KITS[type] };
}

function targetSpot() {
  const p = state.player;
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

function affordable(kit) {
  return state.wood >= kit.wood && state.stone >= kit.stone;
}

export function updateBuild(dt) {
  if (!state.buildMode || !ghost) {
    if (ghost) ghost.visible = false;
    return;
  }
  ghost.visible = true;
  const { x, z } = targetSpot();
  ghost.position.set(x, heightAt(x, z), z);
  ghost.rotation.y = state.player.yaw;

  const kit = CONFIG.BUILD.KITS[currentType()];
  // 橋以外は水際を避ける (橋は水の上に架ける想定で許容)
  const aboveWater = currentType() === 'bridge' || heightAt(x, z) > CONFIG.WATER_LEVEL + 0.2;
  canPlace = affordable(kit) && slopeAt(x, z) <= CONFIG.BUILD.MAX_SLOPE && aboveWater;

  const tint = canPlace ? _green : _red;
  ghost.traverse((o) => { if (o.material) o.material.color.copy(tint); });
}

export function placeStructure() {
  if (!state.buildMode || !canPlace) return false;
  const type = currentType();
  const kit = CONFIG.BUILD.KITS[type];
  const { x, z } = targetSpot();
  state.wood -= kit.wood;
  state.stone -= kit.stone;
  const data = {
    id: 'st_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4),
    type, x, z, rot: state.player.yaw,
  };
  state.structures.push(data);
  addStructureMesh(data);
  playPickup();
  save();
  return true;
}
