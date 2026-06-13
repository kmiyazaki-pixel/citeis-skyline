// =====================================================
//  空 - 昼夜サイクル (空ドーム/太陽/月/星/霧/ライト/露出)
//   ・グラデーション空ドーム (シェーダ) でフラット背景を廃止
//   ・大気値を state.sky と skyUniforms に公開し水・草・将来の建物が共有
// =====================================================

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { scene, lights, renderer, bloomPass, gradeUniforms } from './engine.js';

let sunSphere, moonSphere, stars, dome;
const _sunDir = new THREE.Vector3();

// 空ドームのシェーダが参照する uniform (水なども共有できるよう export)
export const skyUniforms = {
  uZenith:   { value: new THREE.Color(0x4a90d8) },
  uHorizon:  { value: new THREE.Color(0xbfe3f5) },
  uSunColor: { value: new THREE.Color(0xfff0c0) },
  uSunDir:   { value: new THREE.Vector3(0, 1, 0) },
  uSunInt:   { value: 1.0 },
};

// パレット (THREE.Color は内部リニア。シェーダは OutputPass 前=リニアで動く)
const PAL = {
  night: { zen: new THREE.Color(0x0a1130), hor: new THREE.Color(0x16224a), sun: new THREE.Color(0x3a4a72) },
  day:   { zen: new THREE.Color(0x4a90d8), hor: new THREE.Color(0xbfe3f5), sun: new THREE.Color(0xfff0c0) },
  dawn:  { zen: new THREE.Color(0x39508a), hor: new THREE.Color(0xf2a05f), sun: new THREE.Color(0xff8848) },
};

const _zen = new THREE.Color();
const _hor = new THREE.Color();
const _sun = new THREE.Color();
const _key = new THREE.Color();
const KEY_DAY = new THREE.Color(0xfff2d0);
const KEY_GOLD = new THREE.Color(0xffb060);

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function setupSky() {
  scene.background = null; // ドームで描くのでフラット背景を消す

  // --- 空ドーム ---
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uZenith, uHorizon, uSunColor, uSunDir;
      uniform float uSunInt;
      varying vec3 vDir;
      void main() {
        float up = clamp(vDir.y, -1.0, 1.0);
        float t = pow(clamp(up * 0.5 + 0.5, 0.0, 1.0), 0.55);
        vec3 col = mix(uHorizon, uZenith, t);
        float sd = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(sd, 256.0) * 1.4 + pow(sd, 24.0) * 0.28) * uSunInt;
        col += uHorizon * pow(1.0 - abs(up), 8.0) * 0.12; // 地平線のヘイズ
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1; // 最初に描いて背景にする
  scene.add(dome);

  // 太陽と月
  sunSphere = new THREE.Mesh(
    new THREE.SphereGeometry(11, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false })
  );
  scene.add(sunSphere);
  moonSphere = new THREE.Mesh(
    new THREE.SphereGeometry(7, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x9aa6c8, fog: false }) // 控えめにして白飛び/眩しさを防ぐ
  );
  scene.add(moonSphere);

  // 星 (上半球ドーム)
  const starCount = 700;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random());
    const r = 460;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 2.0, sizeAttenuation: false,
    transparent: true, opacity: 0, fog: false,
  }));
  scene.add(stars);
}

export function updateSky(dt, playerPos) {
  state.timeOfDay = (state.timeOfDay + dt / CONFIG.DAY.LENGTH_SEC) % 1;
  const t = state.timeOfDay;

  const a = (t - 0.25) * Math.PI * 2;
  const sy = Math.sin(a);
  const sunDir = _sunDir.set(Math.cos(a), sy, 0.3).normalize();

  const dayness = smoothstep(-0.08, 0.18, sy);
  const glow = Math.max(0, 1 - Math.abs(sy) / 0.28) * (dayness > 0.02 ? 1 : 0.4);

  // 大気を state へ公開 (水・草・将来の建物が参照)
  state.sky.dayness = dayness;
  state.sky.glow = glow;
  state.sky.sunDir.x = sunDir.x;
  state.sky.sunDir.y = sunDir.y;
  state.sky.sunDir.z = sunDir.z;

  // パレット: 夜→昼を dayness で、さらに朝夕へ glow で寄せる
  _zen.copy(PAL.night.zen).lerp(PAL.day.zen, dayness).lerp(PAL.dawn.zen, glow * 0.6);
  _hor.copy(PAL.night.hor).lerp(PAL.day.hor, dayness).lerp(PAL.dawn.hor, glow * 0.7);
  _sun.copy(PAL.night.sun).lerp(PAL.day.sun, dayness).lerp(PAL.dawn.sun, glow * 0.85);
  skyUniforms.uZenith.value.copy(_zen);
  skyUniforms.uHorizon.value.copy(_hor);
  skyUniforms.uSunColor.value.copy(_sun);
  skyUniforms.uSunDir.value.copy(sunDir);
  skyUniforms.uSunInt.value = 0.5 + dayness * 0.8 + glow * 0.6;

  // 霧色は地平線色に追従 (遠景がドームに溶ける)
  scene.fog.color.copy(_hor);

  // ライト
  lights.sun.intensity = 0.12 + dayness * 1.05;
  lights.ambient.intensity = 0.18 + dayness * 0.24;
  lights.hemi.intensity = 0.16 + dayness * 0.34;
  _key.copy(KEY_DAY).lerp(KEY_GOLD, glow);     // ゴールデンアワーで暖色キー
  lights.sun.color.copy(_key);
  lights.rim.intensity = 0.1 + 0.13 * (1 - dayness); // 夜でも控えめ (眩しさ防止)
  lights.rim.position.set(
    playerPos.x - sunDir.x * 120,
    playerPos.y + 60,
    playerPos.z - sunDir.z * 120
  );
  lights.rim.target.position.set(playerPos.x, playerPos.y, playerPos.z);

  // 露出: 夜はしっかり下げて「暗い夜」に (昼夜のコントラストを強く)
  renderer.toneMappingExposure = 0.5 + dayness * 0.7 + glow * 0.15;
  // Bloom しきい値は一定 (夜に下げると画面全体が滲んで周りが見えなくなる)
  if (bloomPass) bloomPass.threshold = 0.85;
  gradeUniforms.uDayness.value = dayness; // カラーグレードのスプリットトーン

  // 影とライトの向きはプレイヤー追従
  lights.sun.position.set(
    playerPos.x + sunDir.x * 140,
    playerPos.y + Math.max(20, sunDir.y * 140),
    playerPos.z + sunDir.z * 140
  );
  lights.sun.target.position.set(playerPos.x, playerPos.y, playerPos.z);

  // 天体・ドーム・星はプレイヤー追従
  dome.position.copy(playerPos);
  sunSphere.position.set(
    playerPos.x + sunDir.x * 440, playerPos.y + sunDir.y * 440, playerPos.z + sunDir.z * 440
  );
  sunSphere.visible = sy > -0.15;
  moonSphere.position.set(
    playerPos.x - sunDir.x * 440, playerPos.y - sunDir.y * 440, playerPos.z - sunDir.z * 440
  );
  moonSphere.visible = -sy > -0.15;

  stars.position.copy(playerPos);
  stars.material.opacity = (1 - dayness) * 0.9;
  stars.visible = stars.material.opacity > 0.02;
}
