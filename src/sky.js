// =====================================================
//  空 - 昼夜サイクル (太陽・月・星・空色・霧・ライト)
// =====================================================

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { scene, lights } from './engine.js';

let sunSphere, moonSphere, stars;

const COL_NIGHT = new THREE.Color('#0d1430');
const COL_DAY = new THREE.Color('#aee3f5');
const COL_DAWN = new THREE.Color('#f2a05f');
const _sky = new THREE.Color();
const _sunDir = new THREE.Vector3();

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function setupSky() {
  // 太陽と月 (霧の影響を受けない自己発光の球)
  sunSphere = new THREE.Mesh(
    new THREE.SphereGeometry(9, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false })
  );
  scene.add(sunSphere);
  moonSphere = new THREE.Mesh(
    new THREE.SphereGeometry(6, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xdfe7ff, fog: false })
  );
  scene.add(moonSphere);

  // 星 (プレイヤー追従のドーム)
  const starCount = 500;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // 上半球にランダム配置
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random()); // 0..π/2 (上半球)
    const r = 420;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false,
    transparent: true, opacity: 0, fog: false,
  }));
  scene.add(stars);
}

export function updateSky(dt, playerPos) {
  state.timeOfDay = (state.timeOfDay + dt / CONFIG.DAY.LENGTH_SEC) % 1;
  const t = state.timeOfDay;

  // 太陽角度: t=0.25 で日の出、t=0.5 で正午、t=0.75 で日の入り
  const a = (t - 0.25) * Math.PI * 2;
  const sy = Math.sin(a);
  const sunDir = _sunDir.set(Math.cos(a), sy, 0.3).normalize();

  // 昼度 (太陽高度から)
  const dayness = smoothstep(-0.08, 0.18, sy);
  // 朝焼け / 夕焼けの強さ (地平線近く)
  const glow = Math.max(0, 1 - Math.abs(sy) / 0.28) * (dayness > 0.02 ? 1 : 0.4);

  // 空と霧の色
  _sky.copy(COL_NIGHT).lerp(COL_DAY, dayness);
  _sky.lerp(COL_DAWN, glow * 0.55);
  scene.background = _sky;
  scene.fog.color.copy(_sky);

  // ライト
  lights.sun.intensity = 0.12 + dayness * 1.0;
  lights.ambient.intensity = 0.16 + dayness * 0.26;
  lights.hemi.intensity = 0.14 + dayness * 0.36;

  // 影とライトの向きはプレイヤー追従
  lights.sun.position.set(
    playerPos.x + sunDir.x * 140,
    playerPos.y + Math.max(20, sunDir.y * 140),
    playerPos.z + sunDir.z * 140
  );
  lights.sun.target.position.set(playerPos.x, playerPos.y, playerPos.z);

  // 天体
  sunSphere.position.set(
    playerPos.x + sunDir.x * 430,
    playerPos.y + sunDir.y * 430,
    playerPos.z + sunDir.z * 430
  );
  sunSphere.visible = sy > -0.15;
  moonSphere.position.set(
    playerPos.x - sunDir.x * 430,
    playerPos.y - sunDir.y * 430,
    playerPos.z - sunDir.z * 430
  );
  moonSphere.visible = -sy > -0.15;

  stars.position.set(playerPos.x, playerPos.y, playerPos.z);
  stars.material.opacity = 1 - dayness;
  stars.visible = stars.material.opacity > 0.02; // 真っ昼間は描画しない
}
