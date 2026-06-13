// =====================================================
//  エンジン - Three.js の renderer / scene / camera / light を
//  一箇所で生成して各モジュールに提供する
// =====================================================

import * as THREE from 'three';

export const isMobile = /Mobi|Android/i.test(navigator.userAgent);
// 主ポインタが粗い (指) 端末のみタッチ扱い。
// タッチ液晶の Windows ノートは false になる (マウス操作が主のため)
export const isTouch = window.matchMedia
  ? window.matchMedia('(pointer: coarse)').matches
  : navigator.maxTouchPoints > 0;

export let renderer = null;
export let scene = null;
export let camera = null;
export const lights = {};

export function setupEngine(canvas) {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobile,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isMobile; // モバイルは影なしで軽量化
  renderer.shadowMap.type = THREE.PCFShadowMap;

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

  lights.sun = new THREE.DirectionalLight(0xfff2d0, 1.0);
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

  resize(canvas);
  window.addEventListener('resize', () => resize(canvas));
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => resize(canvas)).observe(canvas);
  }
}

function resize(canvas) {
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
