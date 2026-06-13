// =====================================================
//  VFX - 粒子演出 (ホタル)
//   プレイヤー追従の Points。夜に出現し、ふわふわ漂う
//   ・テクスチャを使わず gl_PointCoord で円形に
// =====================================================

import * as THREE from 'three';
import { scene, isMobile, reducedMotion } from './engine.js';
import { state } from './state.js';

let fireflies = null;
const uniforms = {
  uTime: { value: 0 },
  uSize: { value: 8 },
  uColor: { value: new THREE.Color(0xcde08a) }, // 落ち着いた黄緑 (暖色の霧化を防ぐ)
  uOpacity: { value: 0 },
  uDrift: { value: reducedMotion ? 0.4 : 1.0 },
};

export function setupVfx() {
  const count = isMobile ? 24 : 50; // 少数の控えめなホタル
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 60;
    pos[i * 3 + 1] = Math.random() * 4;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: `
      attribute float aPhase;
      uniform float uTime, uSize, uDrift;
      varying float vTw;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.6 + aPhase) * 1.6 * uDrift;
        p.y += 1.2 + sin(uTime * 0.9 + aPhase * 1.3) * 0.8 * uDrift;
        p.z += cos(uTime * 0.7 + aPhase * 0.7) * 1.6 * uDrift;
        vTw = 0.45 + 0.55 * sin(uTime * 3.0 + aPhase * 5.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vTw;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d) * vTw * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }`,
  });

  fireflies = new THREE.Points(geo, mat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);
}

export function updateVfx(dt, playerPos) {
  if (!fireflies) return;
  uniforms.uTime.value += dt;
  fireflies.position.set(playerPos.x, playerPos.y, playerPos.z);
  // 夜に出現 (昼は消える)。控えめにして霧化を防ぐ
  const night = 1 - state.sky.dayness;
  uniforms.uOpacity.value = Math.max(0, night - 0.35) * 0.4;
  fireflies.visible = uniforms.uOpacity.value > 0.01;
}
