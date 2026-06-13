// =====================================================
//  エンジン - Three.js の renderer / scene / camera / light を
//  一箇所で生成して各モジュールに提供する
//  描画は EffectComposer 経由 (ACESトーンマップ + Bloom)
// =====================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const isMobile = /Mobi|Android/i.test(navigator.userAgent);
// 主ポインタが粗い (指) 端末のみタッチ扱い。
// タッチ液晶の Windows ノートは false になる (マウス操作が主のため)
export const isTouch = window.matchMedia
  ? window.matchMedia('(pointer: coarse)').matches
  : navigator.maxTouchPoints > 0;
// 「視差効果を減らす」設定。揺れ系の演出を控えめにする
export const reducedMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

export let renderer = null;
export let scene = null;
export let camera = null;
export const lights = {};

export let composer = null;
export let bloomPass = null;
// カラーグレード/ビネットの調整値 (sky.js が uDayness を毎フレーム更新)
export const gradeUniforms = {
  tDiffuse:  { value: null },
  uDayness:  { value: 1.0 },
  uSat:      { value: 1.16 },
  uVignette: { value: 0.85 },
  uCA:       { value: 0.0016 },
};

export function setupEngine(canvas) {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobile,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isMobile; // モバイルは影なしで軽量化
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // ACES フィルミックトーンマップで階調を映画的に (OutputPass が適用)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.error('[engine] WebGL context lost');
  });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaee3f5);
  scene.fog = new THREE.Fog(0xaee3f5, 70, 230);

  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
  camera.position.set(0, 20, 20);

  lights.ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(lights.ambient);

  lights.hemi = new THREE.HemisphereLight(0xbfe8ff, 0x4a5c34, 0.5);
  scene.add(lights.hemi);

  lights.sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
  lights.sun.castShadow = !isMobile;
  lights.sun.shadow.mapSize.set(1024, 1024);
  const d = 60; // 影はプレイヤー周辺のみ (sky.js が毎フレーム追従させる)
  lights.sun.shadow.camera.left = -d;
  lights.sun.shadow.camera.right = d;
  lights.sun.shadow.camera.top = d;
  lights.sun.shadow.camera.bottom = -d;
  lights.sun.shadow.camera.near = 1;
  lights.sun.shadow.camera.far = 220; // ライト距離140 + ボックス±60 + 余裕
  lights.sun.shadow.bias = -0.0006;
  scene.add(lights.sun);
  scene.add(lights.sun.target);

  // リムライト (太陽の反対側からシルエットを起こす。影は落とさない)
  lights.rim = new THREE.DirectionalLight(0xbcd4ff, 0.2);
  scene.add(lights.rim);
  scene.add(lights.rim.target);

  // --- ポストプロセス (Bloom) ---
  //   主役のクリスタルと太陽が滲んで光る。重いライトを足さずに発光感を得る
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    isMobile ? 0.45 : 0.6, // strength
    0.5,                   // radius
    0.82                   // threshold (これ以上明るい所だけ滲む)
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass()); // トーンマップ + 色空間変換

  // カラーグレード + ビネット + 微色収差 (OutputPass の後 = sRGB 空間)
  const caScale = isMobile ? 0.4 : 1.0;
  const gradePass = new ShaderPass({
    uniforms: gradeUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uDayness, uSat, uVignette, uCA;
      varying vec2 vUv;
      void main() {
        vec2 dir = vUv - 0.5;
        // 微色収差 (端ほど強く)
        vec2 off = dir * uCA;
        vec3 c;
        c.r = texture2D(tDiffuse, vUv + off).r;
        c.g = texture2D(tDiffuse, vUv).g;
        c.b = texture2D(tDiffuse, vUv - off).b;
        // 彩度ブースト
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(lum), c, uSat);
        // 昼夜スプリットトーン (影/ハイライトに色を分ける)
        float sh = 1.0 - smoothstep(0.0, 0.5, lum);
        float hi = smoothstep(0.5, 1.0, lum);
        vec3 shadowTint = mix(vec3(0.0, 0.02, 0.08), vec3(0.02, 0.03, 0.10), uDayness); // 影=クール
        vec3 highTint   = mix(vec3(0.02, 0.03, 0.08), vec3(0.10, 0.06, 0.0), uDayness); // ハイライト 夜クール→昼ウォーム
        c += shadowTint * sh * 0.6 + highTint * hi * 0.6;
        // 軽いリフト
        c = pow(max(c, 0.0), vec3(0.96));
        // ビネット
        float d = length(dir);
        float vig = smoothstep(0.85, 0.42, d);
        c *= mix(1.0, vig, uVignette);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  });
  gradeUniforms.uCA.value = reducedMotion ? 0 : 0.0016 * caScale;
  composer.addPass(gradePass);

  resize(canvas);
  window.addEventListener('resize', () => resize(canvas));
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => resize(canvas)).observe(canvas);
  }
}

// main.js のゲームループから毎フレーム呼ぶ描画関数
export function renderFrame() {
  composer.render();
}

function resize(canvas) {
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) {
    // モバイルは Bloom を半解像度にして負荷半減
    const scale = isMobile ? 0.5 : 1;
    composer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio() * scale);
  }
}
