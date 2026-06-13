// =====================================================
//  プレイヤー - 三人称キャラクター操作とカメラ
//   ・地形との接地は world.heightAt で解決 (物理エンジンなし)
//   ・アバターはボックス組みの人型 + 歩行アニメ
// =====================================================

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { scene, camera, reducedMotion } from './engine.js';
import { heightAt } from './world.js';
import { playJump, playStep, playLand, playSplash } from './audio.js';

let avatar = null;
const parts = {};
let walkPhase = 0;

// カメラの手触り用 (遅延追従・着地沈み込み・FOVキック)
const _camPos = new THREE.Vector3();
let camInit = false;
let landDip = 0;       // 現在の沈み込み量 (着地で増え、徐々に戻る)
let wasOnGround = true;
let prevStepIdx = 0;   // 足音トリガ用 (歩行位相の半周ごと)
let prevInWater = false;

function terrainKind(p) {
  if (p.pos.y > 11.5) return 'snow';
  if (p.pos.y < CONFIG.WATER_LEVEL + 0.8) return 'sand';
  return 'grass';
}

function boxMesh(w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, flatShading: true })
  );
  m.castShadow = true;
  return m;
}

// 関節 (pivot) 付きの手足: pivot の位置が付け根、メッシュは下にぶら下がる
function limb(w, h, d, color, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const m = boxMesh(w, h, d, color);
  m.position.y = -h / 2;
  pivot.add(m);
  return pivot;
}

function buildAvatar() {
  const g = new THREE.Group();

  const body = boxMesh(0.5, 0.62, 0.3, '#3aa0c8'); // 服: 水色
  body.position.y = 0.86;
  g.add(body);
  parts.body = body;

  const head = boxMesh(0.34, 0.32, 0.32, '#f4c9a3'); // 肌
  head.position.y = 1.34;
  g.add(head);
  const hair = boxMesh(0.36, 0.12, 0.34, '#5a3a22');
  hair.position.y = 1.52;
  g.add(hair);

  parts.armL = limb(0.13, 0.52, 0.16, '#3aa0c8', 0.33, 1.14, 0);
  parts.armR = limb(0.13, 0.52, 0.16, '#3aa0c8', -0.33, 1.14, 0);
  parts.legL = limb(0.17, 0.55, 0.2, '#3b4a6b', 0.13, 0.55, 0); // ズボン: 紺
  parts.legR = limb(0.17, 0.55, 0.2, '#3b4a6b', -0.13, 0.55, 0);
  g.add(parts.armL, parts.armR, parts.legL, parts.legR);

  return g;
}

export function setupPlayer() {
  // スポーン地点: 原点付近で水没しない場所を探す
  let sx = 0, sz = 0;
  for (let r = 0; r < 400; r += 5) {
    if (heightAt(r, r * 0.7) > CONFIG.WATER_LEVEL + 1.2) {
      sx = r;
      sz = r * 0.7;
      break;
    }
  }
  const p = state.player;
  p.pos.x = sx;
  p.pos.z = sz;
  p.pos.y = heightAt(sx, sz);
  p.yaw = Math.PI * 0.25;

  avatar = buildAvatar();
  scene.add(avatar);
  updateCamera();
}

export function updatePlayer(dt) {
  const P = CONFIG.PLAYER;
  const p = state.player;
  const inp = state.input;

  // --- 視点 (消費式の delta) ---
  p.yaw -= inp.lookDX * P.CAM_SENSITIVITY;
  p.pitch += inp.lookDY * P.CAM_SENSITIVITY;
  p.pitch = Math.max(P.PITCH_MIN, Math.min(P.PITCH_MAX, p.pitch));
  inp.lookDX = 0;
  inp.lookDY = 0;

  // --- 移動 (カメラ基準) ---
  //   forward = カメラからプレイヤーへ向かう水平方向
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const rx = Math.cos(p.yaw),  rz = -Math.sin(p.yaw);
  let mvx = fx * inp.move.z + rx * inp.move.x;
  let mvz = fz * inp.move.z + rz * inp.move.x;
  const len = Math.hypot(mvx, mvz);
  if (len > 1) { mvx /= len; mvz /= len; }

  let speed = inp.running ? P.RUN_SPEED : P.WALK_SPEED;
  const inWater = p.pos.y < CONFIG.WATER_LEVEL - 0.2;
  if (inWater) speed *= P.WATER_SLOW;

  p.pos.x += mvx * speed * dt;
  p.pos.z += mvz * speed * dt;

  // --- 重力と接地 ---
  p.vel.y -= P.GRAVITY * dt;
  p.pos.y += p.vel.y * dt;
  const fallSpeed = -p.vel.y; // 着地衝撃の判定用 (0でクリアされる前に記録)
  const ground = heightAt(p.pos.x, p.pos.z);
  if (p.pos.y <= ground) {
    p.pos.y = ground;
    p.vel.y = 0;
    p.onGround = true;
  } else if (p.onGround && p.vel.y <= 0 && p.pos.y - ground <= P.SNAP_DOWN) {
    // 下り坂: 前フレーム接地中で小さな段差なら地面に吸着する。
    // これが無いと下りで接地/空中が毎フレーム揺れてジャンプが効かなくなる
    // (ジャンプ直後は onGround=false かつ vel.y>0 なので発動しない)
    p.pos.y = ground;
    p.vel.y = 0;
  } else {
    p.onGround = false;
  }

  // --- ジャンプ (入力バッファ: 着地の少し前の入力も生かす) ---
  if (inp.jumpQueued) {
    inp.jumpBufferT = P.JUMP_BUFFER;
    inp.jumpQueued = false;
  }
  if (inp.jumpBufferT > 0) {
    if (p.onGround) {
      p.vel.y = P.JUMP_SPEED;
      p.onGround = false;
      inp.jumpBufferT = 0;
      playJump();
    } else {
      inp.jumpBufferT -= dt;
    }
  }

  // --- アバターの向きと歩行アニメ ---
  const moving = len > 0.01;
  if (moving) {
    const target = Math.atan2(mvx, mvz);
    let diff = target - p.avatarYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.avatarYaw += diff * Math.min(1, P.TURN_LERP * dt);
    walkPhase += dt * speed * 1.7;
  } else {
    walkPhase *= Math.max(0, 1 - dt * 8); // 静止したら振りを減衰
  }
  const swing = Math.sin(walkPhase) * (moving ? 0.7 : 0.25);
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = -swing * 0.8;
  parts.armR.rotation.x = swing * 0.8;

  avatar.position.set(p.pos.x, p.pos.y, p.pos.z);
  avatar.rotation.y = p.avatarYaw;

  // 足音: 歩行位相が半周するごとに1歩 (接地・移動中・非水中のみ)
  const stepIdx = Math.floor(walkPhase / Math.PI);
  if (stepIdx !== prevStepIdx) {
    if (moving && p.onGround && !inWater) playStep(terrainKind(p));
    prevStepIdx = stepIdx;
  }

  // 着地の検出 → カメラ沈み込み + 着地音 (落下速度に比例)
  if (!wasOnGround && p.onGround && fallSpeed > 2) {
    landDip = Math.min(P.LAND_DIP, fallSpeed * 0.05);
    if (inWater) playSplash(); else playLand();
  }
  wasOnGround = p.onGround;

  // 水に入った瞬間の水しぶき
  if (inWater && !prevInWater) playSplash();
  prevInWater = inWater;
  landDip = Math.max(0, landDip - landDip * P.LAND_DIP_RECOVER * dt);

  // ダッシュ中は FOV を広げてスピード感を出す (視差軽減設定では無効)
  const fovTarget = (!reducedMotion && inp.running && moving) ? P.FOV_DASH : P.FOV_BASE;
  camera.fov += (fovTarget - camera.fov) * Math.min(1, P.FOV_LERP * dt);
  camera.updateProjectionMatrix();

  updateCamera(dt);
}

// タイトル画面: ゆっくり旋回してワールドを見せる
export function updateTitleCamera(dt) {
  state.player.yaw += dt * 0.12;
  updateCamera(dt);
}

function updateCamera(dt) {
  const P = CONFIG.PLAYER;
  const p = state.player;
  const cosP = Math.cos(p.pitch);
  let cx = p.pos.x + Math.sin(p.yaw) * P.CAM_DISTANCE * cosP;
  let cz = p.pos.z + Math.cos(p.yaw) * P.CAM_DISTANCE * cosP;
  let cy = p.pos.y + P.CAM_HEIGHT + Math.sin(p.pitch) * P.CAM_DISTANCE - landDip;
  // カメラが地形にめり込まないように
  const camGround = heightAt(cx, cz) + 0.5;
  if (cy < camGround) cy = camGround;

  // 目標位置へ遅延追従 (初回はスナップ)
  if (!camInit || dt === undefined) {
    _camPos.set(cx, cy, cz);
    camInit = true;
  } else {
    const k = Math.min(1, P.CAM_LERP * dt);
    _camPos.x += (cx - _camPos.x) * k;
    _camPos.y += (cy - _camPos.y) * k;
    _camPos.z += (cz - _camPos.z) * k;
  }
  camera.position.copy(_camPos);
  camera.lookAt(p.pos.x, p.pos.y + 1.4 - landDip * 0.5, p.pos.z);
}
