// =====================================================
//  描画 - Three.js で 3D シーンを構築・更新
//   ・他のファイルから scene/camera を直接触らない
//   ・タイルは tileViews[y][x] に持って差分更新する
//   ・geometry/material は共有 (SHARED + MAT_CACHE)
//   ・窓は scene 全体で 1 つの InstancedMesh
//   ・影方式: 静的な建物/木のみ castShadow。動くもの
//     (車・雲・噴水・川・窓) は castShadow=false で統一し、
//     shadowMap はタイル変化時のみ更新 (tilesDirty)
// =====================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';
import { CONFIG } from './config.js';
import { $canvas } from './dom.js';

const W = CONFIG.GRID.WIDTH;
const H = CONFIG.GRID.HEIGHT;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let renderer, scene, camera, controls;
let groundMesh;
let windowsMesh;          // InstancedMesh, 全建物の窓を 1 つで描画
let parkedBody, parkedCabin; // InstancedMesh, 駐車車両
let riverGeo = null;      // 川のさざ波アニメ用
let colors = null;
const tileViews = [];     // tileViews[y][x] = { type, mesh, tree }
let tilesDirty = true;    // 影マップを更新するかどうか

// アニメーション状態 (すべて renderer 内に閉じる)
let lastNow = 0;
let twinkleAt = 0;
const anim = { plumes: [], clouds: [], t: 0 };

// 走行車
const cars = [];
let roadList = [];
let roadsVersion = 0;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const _dummyObj = new THREE.Object3D();
const _color = new THREE.Color();
const _litColor = new THREE.Color(CONFIG.VISUAL.PALETTE.WINDOW_LIT);
const _dimColor = new THREE.Color(CONFIG.VISUAL.PALETTE.WINDOW_DIM);

// 共有ジオメトリ (使い回しで dispose しない)
const SHARED = {
  box:    new THREE.BoxGeometry(1, 1, 1),
  plane:  new THREE.PlaneGeometry(1, 1),
  cone4:  new THREE.ConeGeometry(0.62, 0.5, 4),
  cone8:  new THREE.ConeGeometry(0.05, 0.4, 8),
  pine:   new THREE.ConeGeometry(0.30, 0.9, 7),
  cyl:    new THREE.CylinderGeometry(1, 1, 1, 8),
  sphere: new THREE.SphereGeometry(0.26, 8, 6),
};

// マテリアルキャッシュ (色ごとに 1 つ)
//   注意: 共有なので material プロパティをアニメさせない (全インスタンス同期で動く)
const MAT_CACHE = new Map();
function mat(hex, opts = {}) {
  const key = hex + ':' + JSON.stringify(opts);
  let m = MAT_CACHE.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex, ...opts });
    MAT_CACHE.set(key, m);
  }
  return m;
}

// 擬似乱数 (タイル座標から決定的に [0, 1) を返す)
function hash01(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function cssColor(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || '#888888');
}

function loadColors() {
  colors = {
    grass: cssColor('--grass'),
  };
}

// =====================================================
//  setupCanvas - 1 度だけ呼ばれる初期化
// =====================================================
export function setupCanvas() {
  loadColors();

  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  renderer = new THREE.WebGLRenderer({
    canvas: $canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // タイル変化時のみ更新

  $canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.error('[renderer] WebGL context lost');
  });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb8e0f0);
  scene.fog = new THREE.Fog(0xb8e0f0, W * 1.6, W * 4);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 250);
  camera.position.set(W * 0.95, H * 0.85, H * 1.2);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(W / 2, 0, H / 2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = W * 0.35;
  controls.maxDistance = W * 2.5;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.mouseButtons = {
    LEFT:   null,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  THREE.MOUSE.ROTATE,
  };
  controls.touches = {
    ONE: null,
    TWO: THREE.TOUCH.DOLLY_ROTATE,
  };
  controls.update();

  // ライト
  scene.add(new THREE.AmbientLight(0xffffff, 0.30));
  scene.add(new THREE.HemisphereLight(0xb8e0f0, 0x4a5c34, 0.50));
  const sun = new THREE.DirectionalLight(0xfff4d6, 0.90);
  sun.position.set(W * 0.6, H * 1.8, H * 0.4);
  sun.castShadow = true;
  const shadowSize = isMobile ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const d = Math.max(W, H) * 0.85;
  sun.shadow.camera.left   = -d;
  sun.shadow.camera.right  =  d;
  sun.shadow.camera.top    =  d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near   = 0.5;
  sun.shadow.camera.far    = H * 4;
  sun.shadow.bias = -0.0008;
  sun.target.position.set(W / 2, 0, H / 2);
  scene.add(sun);
  scene.add(sun.target);

  // 地面 (高低ノイズ + 頂点カラーの色ムラ + フラットシェーディング)
  const groundGeo = new THREE.PlaneGeometry(W, H, W, H);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, (Math.sin(x * 1.7 + y * 0.6) + Math.cos(y * 1.3 - x * 0.4)) * 0.06);
  }
  groundGeo.computeVertexNormals();
  // 草の色ムラ (±10% の明暗)
  const gcol = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _color.copy(colors.grass).multiplyScalar(0.90 + hash01(pos.getX(i), pos.getY(i)) * 0.20);
    gcol[i * 3]     = _color.r;
    gcol[i * 3 + 1] = _color.g;
    gcol[i * 3 + 2] = _color.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
  const groundMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, vertexColors: true, flatShading: true,
  });
  groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(W / 2, 0, H / 2);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // 川 (片側の自動装飾、さざ波アニメ付き)
  addRiverEdge();

  // グリッド線
  const grid = new THREE.GridHelper(W, W, 0x000000, 0x000000);
  grid.material.opacity = 0.10;
  grid.material.transparent = true;
  grid.position.set(W / 2, 0.06, H / 2);
  scene.add(grid);

  // 全建物の窓 / 駐車車両 / 雲
  initWindows();
  initParkedCars();
  initClouds();

  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      row.push({ type: 'empty', mesh: null, tree: null });
    }
    tileViews.push(row);
  }

  resize();
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe($canvas);
  } else {
    setTimeout(resize, 0);
    setTimeout(resize, 200);
  }
}

function resize() {
  const w = Math.max(1, $canvas.clientWidth);
  const h = Math.max(1, $canvas.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// =====================================================
//  川 (グリッドの上端、頂点を毎フレーム揺らす)
// =====================================================
function addRiverEdge() {
  const geo = new THREE.PlaneGeometry(W + 8, 5, 32, 4);
  // flatShading はシェーダ内で面法線を導出するため computeVertexNormals 不要
  geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  riverGeo = geo;
  const riverMat = new THREE.MeshLambertMaterial({
    color: CONFIG.VISUAL.PALETTE.RIVER, flatShading: true,
  });
  const river = new THREE.Mesh(geo, riverMat);
  river.rotation.x = -Math.PI / 2;
  river.position.set(W / 2, -0.05, -2.5);
  river.receiveShadow = true;
  scene.add(river);
}

// =====================================================
//  Tier (1〜15) を決定的に算出
// =====================================================
function tileTier(x, y) {
  const cx = W / 2, cy = H / 2;
  const dist = Math.hypot(x - cx, y - cy);
  const downtownBoost = dist < CONFIG.VISUAL.DOWNTOWN_RADIUS ? 0.15 : 0;
  const r = Math.min(0.999, hash01(x * 0.97, y * 1.13) + downtownBoost);
  const T = CONFIG.VISUAL.TIER;
  if (r < T.LOW_RATIO) {
    return 1 + Math.floor((r / T.LOW_RATIO) * 3);
  }
  if (r < T.LOW_RATIO + T.MID_RATIO) {
    return 4 + Math.floor(((r - T.LOW_RATIO) / T.MID_RATIO) * 5);
  }
  return 9 + Math.floor(((r - 0.90) / 0.10) * 7);
}

// =====================================================
//  InstancedMesh の窓 (またたき対応: instanceColor)
// =====================================================
function initWindows() {
  const geo = new THREE.BoxGeometry(0.08, 0.10, 0.02);
  // instanceColor は material.color と乗算されるので白ベースにする
  const winMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0x221805,
    emissiveIntensity: 0.3,
  });
  windowsMesh = new THREE.InstancedMesh(geo, winMat, CONFIG.VISUAL.MAX_WINDOWS);
  windowsMesh.count = 0;
  windowsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // setColorAt 任せだと count=0 時にゼロサイズの色バッファが確保されてしまうので
  // 最大容量で明示的に確保しておく
  windowsMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(CONFIG.VISUAL.MAX_WINDOWS * 3), 3
  );
  windowsMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  windowsMesh.castShadow = false;
  windowsMesh.receiveShadow = false;
  scene.add(windowsMesh);
}

function rebuildWindows() {
  let count = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = state.grid[y][x];
      if (tile.type !== 'residential') continue;
      const tier = tileTier(x, y);
      const h = tier * CONFIG.VISUAL.TIER.STORY_H;
      const wall = tier <= 3 ? 0.78 : tier <= 8 ? 0.82 : 0.72;
      const halfWall = wall / 2;
      const baseX = x + 0.5;
      const baseZ = y + 0.5;
      for (let row = 0; row < tier; row++) {
        const yy = (row + 0.5) * (h / tier);
        const faces = [
          [0,  halfWall + 0.012, 0],
          [0, -halfWall - 0.012, Math.PI],
          [ halfWall + 0.012, 0, Math.PI / 2],
          [-halfWall - 0.012, 0, -Math.PI / 2],
        ];
        for (const [dx, dz, rotY] of faces) {
          for (const col of [-wall * 0.22, wall * 0.22]) {
            if (count >= CONFIG.VISUAL.MAX_WINDOWS) {
              finishWindows(count);
              return;
            }
            const isXFace = Math.abs(dx) > 0.01;
            const wx = baseX + dx + (isXFace ? 0 : col);
            const wz = baseZ + dz + (isXFace ? col : 0);
            _dummyObj.position.set(wx, yy, wz);
            _dummyObj.rotation.set(0, rotY, 0);
            _dummyObj.scale.set(1, 1, 1);
            _dummyObj.updateMatrix();
            windowsMesh.setMatrixAt(count, _dummyObj.matrix);
            // 初期色: 約 75% が点灯
            const lit = hash01(x * 13 + row, y * 7 + col * 10) < 0.75;
            windowsMesh.setColorAt(count, lit ? _litColor : _dimColor);
            count++;
          }
        }
      }
    }
  }
  finishWindows(count);
}

function finishWindows(count) {
  windowsMesh.count = count;
  windowsMesh.instanceMatrix.needsUpdate = true;
  if (windowsMesh.instanceColor) windowsMesh.instanceColor.needsUpdate = true;
}

// =====================================================
//  駐車車両 (InstancedMesh ×2、windows と同じ rebuild フロー)
// =====================================================
function initParkedCars() {
  parkedBody = new THREE.InstancedMesh(
    SHARED.box,
    new THREE.MeshLambertMaterial({ color: 0xffffff }), // instanceColor 乗算用
    W * H
  );
  parkedCabin = new THREE.InstancedMesh(SHARED.box, mat('#222831'), W * H);
  parkedBody.count = 0;
  parkedCabin.count = 0;
  // 色バッファは最大容量で明示確保 (initWindows と同じ理由)
  parkedBody.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(W * H * 3), 3
  );
  parkedBody.castShadow = false;
  parkedCabin.castShadow = false;
  scene.add(parkedBody);
  scene.add(parkedCabin);
}

function rebuildParkedCars() {
  const C = CONFIG.VISUAL.CARS;
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (state.grid[y][x].type !== 'road') continue;
      if (countRoadNeighbors(x, y) >= 3) continue; // 交差点には停めない
      if (hash01(x + 5, y + 8) >= C.PARKED_RATIO) continue;
      const vertical = isRoad(x, y - 1) || isRoad(x, y + 1);
      const side = hash01(x + 9, y + 2) < 0.5 ? -0.32 : 0.32;
      const px = x + 0.5 + (vertical ? side : 0);
      const pz = y + 0.5 + (vertical ? 0 : side);
      _dummyObj.rotation.set(0, vertical ? Math.PI / 2 : 0, 0);
      _dummyObj.position.set(px, 0.21, pz);
      _dummyObj.scale.set(0.34, 0.10, 0.16);
      _dummyObj.updateMatrix();
      parkedBody.setMatrixAt(n, _dummyObj.matrix);
      parkedBody.setColorAt(n, _color.set(C.COLORS[Math.floor(hash01(x * 3, y * 7) * C.COLORS.length)]));
      _dummyObj.position.y = 0.295;
      _dummyObj.scale.set(0.18, 0.08, 0.14);
      _dummyObj.updateMatrix();
      parkedCabin.setMatrixAt(n, _dummyObj.matrix);
      n++;
    }
  }
  parkedBody.count = n;
  parkedCabin.count = n;
  parkedBody.instanceMatrix.needsUpdate = true;
  parkedCabin.instanceMatrix.needsUpdate = true;
  if (parkedBody.instanceColor) parkedBody.instanceColor.needsUpdate = true;
}

// =====================================================
//  流れる雲 + 偽ブロブ影
//   本物の影は影マップ凍結方式と相性が悪いので、
//   薄い半透明の円盤を雲の真下に落として代用する
// =====================================================
function initClouds() {
  const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xf4f8fb, transparent: true, opacity: 0.85, flatShading: true,
  });
  const blobMat = new THREE.MeshBasicMaterial({
    color: 0x22384a, transparent: true, opacity: 0.08, depthWrite: false,
  });
  for (let i = 0; i < CONFIG.VISUAL.CLOUD_COUNT; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(SHARED.sphere, cloudMat);
      s.scale.setScalar(2.0 + hash01(i, k) * 2.2);
      s.position.set((k - 1) * 1.3, hash01(i, k + 9) * 0.5, (hash01(i, k + 5) - 0.5) * 1.4);
      g.add(s);
    }
    const alt = 10 + hash01(i, 3) * 3;
    const blob = new THREE.Mesh(SHARED.cyl, blobMat);
    blob.scale.set(2.2, 0.005, 2.2);
    blob.position.y = 0.18 - alt; // 子座標で相殺 → ワールド y≈0.18
    g.add(blob);
    g.position.set(hash01(i, 1) * (W + 16) - 8, alt, hash01(i, 2) * H);
    g.userData.speed = 0.5 + hash01(i, 7) * 0.5;
    anim.clouds.push(g);
    scene.add(g);
  }
}

// =====================================================
//  走行車 (装飾のみ。左側通行、交差点で曲がる)
// =====================================================
function isRoad(x, y) {
  return x >= 0 && y >= 0 && x < W && y < H && state.grid[y][x].type === 'road';
}

function laneOffset(dx, dy) {
  // 左側通行: 進行方向の左側にオフセット
  const L = CONFIG.VISUAL.CARS.LANE_OFFSET;
  return { x: dy * L, z: -dx * L };
}

function rebuildRoadList() {
  roadList = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (state.grid[y][x].type === 'road') roadList.push([x, y]);
    }
  }
  roadsVersion++;
}

function makeCarMesh(i) {
  const C = CONFIG.VISUAL.CARS;
  const group = new THREE.Group();
  const body = new THREE.Mesh(SHARED.box, mat(C.COLORS[i % C.COLORS.length]));
  body.scale.set(0.34, 0.10, 0.16);
  body.position.y = 0.21;
  group.add(body);
  const cabin = new THREE.Mesh(SHARED.box, mat('#222831'));
  cabin.scale.set(0.18, 0.08, 0.14);
  cabin.position.set(-0.02, 0.295, 0);
  group.add(cabin);
  group.visible = false;
  return group;
}

function spawnCar(car) {
  if (roadList.length === 0) {
    car.mesh.visible = false;
    car.idle = true;
    car.roadsVersionAtIdle = roadsVersion;
    return;
  }
  const [tx, ty] = roadList[Math.floor(Math.random() * roadList.length)];
  const dirs = DIRS.filter(([dx, dy]) => isRoad(tx + dx, ty + dy));
  if (dirs.length === 0) {
    // 孤立タイル: 別の道路網ができるまで待つ
    car.mesh.visible = false;
    car.idle = true;
    car.roadsVersionAtIdle = roadsVersion;
    return;
  }
  const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
  const lane = laneOffset(dx, dy);
  car.dx = dx;
  car.dy = dy;
  car.from = { x: tx + 0.5 + lane.x, z: ty + 0.5 + lane.z };
  car.tx = tx + dx;
  car.ty = ty + dy;
  car.to = { x: car.tx + 0.5 + lane.x, z: car.ty + 0.5 + lane.z };
  car.progress = 0;
  car.segLen = Math.max(0.0001, Math.hypot(car.to.x - car.from.x, car.to.z - car.from.z));
  car.idle = false;
  car.mesh.visible = true;
}

function chooseNext(car) {
  const { tx, ty, dx, dy } = car;
  const straight = [dx, dy];
  const left  = [dy, -dx];
  const right = [-dy, dx];
  const options = [straight, left, right].filter(([ax, ay]) => isRoad(tx + ax, ty + ay));
  let next = null;
  if (options.length > 0) {
    if (isRoad(tx + dx, ty + dy) && Math.random() < 0.65) {
      next = straight; // 直進優先
    } else {
      next = options[Math.floor(Math.random() * options.length)];
    }
  } else if (isRoad(tx - dx, ty - dy)) {
    next = [-dx, -dy]; // 行き止まり: U ターン
  }
  if (!next) {
    // 完全に孤立: 道路網が変わるまで待機
    car.idle = true;
    car.roadsVersionAtIdle = roadsVersion;
    return;
  }
  const [nx, ny] = next;
  const lane = laneOffset(nx, ny);
  car.dx = nx;
  car.dy = ny;
  car.from = { x: car.to.x, z: car.to.z };
  car.tx = tx + nx;
  car.ty = ty + ny;
  car.to = { x: car.tx + 0.5 + lane.x, z: car.ty + 0.5 + lane.z };
  car.progress = 0;
  car.segLen = Math.max(0.0001, Math.hypot(car.to.x - car.from.x, car.to.z - car.from.z));
}

function placeCar(car) {
  const t = Math.min(car.progress, 1);
  const x = car.from.x + (car.to.x - car.from.x) * t;
  const z = car.from.z + (car.to.z - car.from.z) * t;
  car.mesh.position.set(x, 0, z);
  const vx = car.to.x - car.from.x;
  const vz = car.to.z - car.from.z;
  if (Math.abs(vx) + Math.abs(vz) > 0.0001) {
    car.mesh.rotation.y = Math.atan2(-vz, vx);
  }
}

function updateCars(dt) {
  const C = CONFIG.VISUAL.CARS;
  // 道路量に応じた台数 (道路 3 タイルごとに 1 台、上限 MAX)
  const desired = Math.min(C.MAX, Math.ceil(roadList.length / 3));
  while (cars.length < C.MAX) {
    const mesh = makeCarMesh(cars.length);
    scene.add(mesh);
    cars.push({
      mesh, idle: true, roadsVersionAtIdle: -1,
      tx: 0, ty: 0, dx: 1, dy: 0,
      from: { x: 0, z: 0 }, to: { x: 0, z: 0 },
      progress: 0, segLen: 1,
    });
  }
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (i >= desired) {
      car.mesh.visible = false;
      car.idle = true;
      car.roadsVersionAtIdle = -1; // 復帰時に必ずリスポーン
      continue;
    }
    if (car.idle) {
      if (car.roadsVersionAtIdle !== roadsVersion) spawnCar(car);
      if (car.idle) continue;
    }
    // 足元の道路が消えた → 即リスポーン
    if (!isRoad(car.tx, car.ty)) {
      spawnCar(car);
      if (car.idle) continue;
    }
    car.progress += (dt * C.SPEED) / car.segLen;
    let guard = 4;
    while (car.progress >= 1 && guard-- > 0) {
      const overshoot = (car.progress - 1) * car.segLen;
      chooseNext(car);
      if (car.idle) break;
      car.progress = overshoot / car.segLen;
    }
    if (!car.idle) placeCar(car);
    else car.mesh.visible = false;
  }
}

// =====================================================
//  毎フレームのアニメーション (噴水・川・雲・車・窓)
// =====================================================
function animateDecor(dt) {
  // 川のさざ波
  if (riverGeo) {
    const p = riverGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setZ(i,
        Math.sin(p.getX(i) * 0.6 + anim.t * 1.2) * 0.04 +
        Math.sin(p.getY(i) * 2.0 + anim.t * 0.7) * 0.02
      );
    }
    p.needsUpdate = true;
  }
  // 噴水プルームの脈動 (scale のみ。material は共有なので触らない)
  for (const p of anim.plumes) {
    const s = 1 + 0.15 * Math.sin(anim.t * 3 + p.userData.phase);
    p.scale.set(2 - s, s, 2 - s);
    p.position.y = 0.20 + 0.20 * s; // 根本を水盤に固定
  }
  // 流れる雲
  for (const c of anim.clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > W + 8) c.position.x = -8;
  }
  // 走行車
  updateCars(dt);
  // 窓のまたたき (約 400ms ごとに 15 個トグル)
  if (windowsMesh.count > 0 && anim.t * 1000 - twinkleAt > 400) {
    twinkleAt = anim.t * 1000;
    for (let k = 0; k < 15; k++) {
      const i = Math.floor(Math.random() * windowsMesh.count);
      windowsMesh.setColorAt(i, Math.random() < 0.5 ? _litColor : _dimColor);
    }
    if (windowsMesh.instanceColor) windowsMesh.instanceColor.needsUpdate = true;
  }
}

// =====================================================
//  タイル別メッシュ生成
// =====================================================
function makeRoadMesh(x, y) {
  const group = new THREE.Group();
  // 歩道
  const sw = new THREE.Mesh(SHARED.box, mat(CONFIG.VISUAL.PALETTE.SIDEWALK));
  sw.scale.set(1, 0.10, 1);
  sw.position.y = 0.05;
  sw.receiveShadow = true;
  group.add(sw);
  // 道路本体
  const road = new THREE.Mesh(SHARED.box, mat('#3a3a3a'));
  road.scale.set(0.82, 0.06, 0.82);
  road.position.y = 0.13;
  road.receiveShadow = true;
  group.add(road);
  // 中央破線
  const lineMat = mat('#f5f5f5');
  for (const dz of [-0.30, 0, 0.30]) {
    const ln = new THREE.Mesh(SHARED.box, lineMat);
    ln.scale.set(0.18, 0.01, 0.06);
    ln.position.set(0, 0.17, dz);
    group.add(ln);
  }
  // 街灯 (角に 1 本)
  const sgn = hash01(x, y) < 0.5 ? -1 : 1;
  const pole = new THREE.Mesh(SHARED.cyl, mat('#2a2a2a'));
  pole.scale.set(0.04, CONFIG.VISUAL.STREETLIGHT_HEIGHT, 0.04);
  pole.position.set(0.42 * sgn, CONFIG.VISUAL.STREETLIGHT_HEIGHT / 2 + 0.10, 0.42 * sgn);
  pole.castShadow = true;
  group.add(pole);
  const bulb = new THREE.Mesh(
    SHARED.box,
    mat(CONFIG.VISUAL.PALETTE.WINDOW_LIT, { emissive: 0xffe6a0, emissiveIntensity: 0.7 })
  );
  bulb.scale.set(0.16, 0.08, 0.16);
  bulb.position.set(0.42 * sgn, CONFIG.VISUAL.STREETLIGHT_HEIGHT + 0.05, 0.42 * sgn);
  group.add(bulb);
  // 交差点 (隣接道路 3 つ以上) なら横断歩道
  if (countRoadNeighbors(x, y) >= 3) {
    const stripeMat = mat('#f0f0f0');
    for (let i = -2; i <= 2; i++) {
      const s1 = new THREE.Mesh(SHARED.box, stripeMat);
      s1.scale.set(0.05, 0.011, 0.18);
      s1.position.set(i * 0.10, 0.18, 0.42);
      group.add(s1);
      const s2 = new THREE.Mesh(SHARED.box, stripeMat);
      s2.scale.set(0.18, 0.011, 0.05);
      s2.position.set(0.42, 0.18, i * 0.10);
      group.add(s2);
    }
  }
  group.position.set(x + 0.5, 0, y + 0.5);
  group.matrixAutoUpdate = false;
  group.updateMatrix();
  return group;
}

function countRoadNeighbors(x, y) {
  let n = 0;
  for (const [dx, dy] of DIRS) {
    const row = state.grid[y + dy];
    if (row && row[x + dx] && row[x + dx].type === 'road') n++;
  }
  return n;
}

function makeResidentialMesh(x, y, occupancy) {
  const group = new THREE.Group();
  const tier = tileTier(x, y);
  const STORY_H = CONFIG.VISUAL.TIER.STORY_H;
  const h = tier * STORY_H;
  const wallHex = CONFIG.VISUAL.PALETTE.WALLS[Math.floor(hash01(x, y) * CONFIG.VISUAL.PALETTE.WALLS.length)];
  const bodyMat = mat(wallHex);

  if (tier <= 3) {
    // 低層: 本体 + ピラミッド屋根 + 玄関ドア + 生垣
    const w = 0.78 + hash01(x, y + 1) * 0.08;
    const body = new THREE.Mesh(SHARED.box, bodyMat);
    body.scale.set(w, h, w);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const roofHex = CONFIG.VISUAL.PALETTE.LOW_ROOFS[(x + y) % CONFIG.VISUAL.PALETTE.LOW_ROOFS.length];
    const roof = new THREE.Mesh(SHARED.cone4, mat(roofHex));
    roof.position.y = h + 0.25;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
    // 玄関ドア
    const door = new THREE.Mesh(SHARED.box, mat('#4a3828'));
    door.scale.set(0.16, 0.30, 0.03);
    door.position.set(0, 0.15, w / 2 + 0.02);
    group.add(door);
    // 生垣 (ドアの両脇)
    const hedgeMat = mat('#3f7a33');
    for (const hx of [-0.26, 0.26]) {
      const hg = new THREE.Mesh(SHARED.box, hedgeMat);
      hg.scale.set(0.30, 0.18, 0.10);
      hg.position.set(hx, 0.09, w / 2 + 0.08);
      group.add(hg);
    }
    group.userData.body = body;
  } else if (tier <= 8) {
    // 中層: フラット屋根 + バルコニー + 屋上 AC
    const body = new THREE.Mesh(SHARED.box, bodyMat);
    body.scale.set(0.82, h, 0.82);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const balcony = new THREE.Mesh(SHARED.box, mat('#cccccc'));
    balcony.scale.set(0.92, 0.05, 0.12);
    balcony.position.set(0, h * 0.5, 0.45);
    group.add(balcony);
    const ac = new THREE.Mesh(SHARED.box, mat('#8a8a8a'));
    ac.scale.set(0.2, 0.18, 0.2);
    ac.position.set(0.2, h + 0.09, 0.1);
    ac.castShadow = true;
    group.add(ac);
    group.userData.body = body;
  } else {
    // 高層: 2 段セットバック + アンテナ
    const hLo = h * 0.7;
    const hHi = h * 0.3;
    const lo = new THREE.Mesh(SHARED.box, bodyMat);
    lo.scale.set(0.72, hLo, 0.72);
    lo.position.y = hLo / 2;
    lo.castShadow = true;
    lo.receiveShadow = true;
    group.add(lo);
    const crownHex = CONFIG.VISUAL.PALETTE.HIGH_CROWNS[Math.floor(hash01(x + 3, y + 5) * CONFIG.VISUAL.PALETTE.HIGH_CROWNS.length)];
    const hi = new THREE.Mesh(SHARED.box, mat(crownHex));
    hi.scale.set(0.50, hHi, 0.50);
    hi.position.y = hLo + hHi / 2;
    hi.castShadow = true;
    group.add(hi);
    const ant = new THREE.Mesh(SHARED.cyl, mat('#444444'));
    ant.scale.set(0.02, 0.6, 0.02);
    ant.position.y = h + 0.3;
    group.add(ant);
    group.userData.body = lo;
  }

  group.position.set(x + 0.5, 0, y + 0.5);
  group.matrixAutoUpdate = false;
  group.updateMatrix();
  return group;
}

function makePlazaMesh(x, y) {
  const group = new THREE.Group();
  // 床
  const floor = new THREE.Mesh(SHARED.box, mat(CONFIG.VISUAL.PALETTE.SIDEWALK));
  floor.scale.set(1, 0.05, 1);
  floor.position.y = 0.025;
  floor.receiveShadow = true;
  group.add(floor);
  const useFountain = hash01(x + 2, y + 4) < CONFIG.PLAZA.FOUNTAIN_PROBABILITY;
  if (useFountain) {
    // 噴水: 基盤 + 水盤 + 脈動するプルーム
    const basin = new THREE.Mesh(SHARED.cyl, mat('#b8b0a8'));
    basin.scale.set(0.3, 0.1, 0.3);
    basin.position.y = 0.10;
    basin.castShadow = true;
    group.add(basin);
    const water = new THREE.Mesh(SHARED.cyl, mat(CONFIG.VISUAL.PALETTE.RIVER, { transparent: true, opacity: 0.75 }));
    water.scale.set(0.26, 0.02, 0.26);
    water.position.y = 0.16;
    group.add(water);
    const plume = new THREE.Mesh(SHARED.cone8, mat('#cfe5f0', { transparent: true, opacity: 0.55 }));
    plume.position.y = 0.40;
    plume.userData.phase = hash01(x, y) * Math.PI * 2; // 噴水ごとに位相をずらす
    anim.plumes.push(plume);
    group.userData.plume = plume; // disposeMesh がレジストリから除去する用
    group.add(plume);
  } else {
    // ベンチ
    const benchMat = mat('#6b4a32');
    for (const [bx, bz] of [[-0.30, 0.30], [0.30, -0.30]]) {
      const b = new THREE.Mesh(SHARED.box, benchMat);
      b.scale.set(0.36, 0.06, 0.10);
      b.position.set(bx, 0.08, bz);
      b.castShadow = true;
      group.add(b);
    }
  }
  group.position.set(x + 0.5, 0, y + 0.5);
  group.matrixAutoUpdate = false;
  group.updateMatrix();
  return group;
}

function makeTreeMesh(x, y) {
  const group = new THREE.Group();
  const scale = 0.85 + hash01(x * 5, y * 3) * 0.4;
  const trunk = new THREE.Mesh(SHARED.cyl, mat('#5a3a22'));
  trunk.scale.set(0.06, 0.4 * scale, 0.06);
  trunk.position.y = 0.2 * scale;
  trunk.castShadow = true;
  group.add(trunk);
  // 松 / 桜 / 通常 の 3 種
  const isPine = hash01(x + 4, y + 17) < CONFIG.VISUAL.PINE_RATIO;
  if (isPine) {
    const pmat = mat('#3a6a3a');
    const lower = new THREE.Mesh(SHARED.pine, pmat);
    lower.position.y = 0.55 * scale;
    lower.scale.setScalar(scale);
    lower.castShadow = true;
    group.add(lower);
    const upper = new THREE.Mesh(SHARED.pine, pmat);
    upper.position.y = 0.95 * scale;
    upper.scale.setScalar(scale * 0.7);
    upper.castShadow = true;
    group.add(upper);
  } else {
    const isSakura = hash01(x + 7, y + 13) < CONFIG.VISUAL.SAKURA_RATIO;
    const leafHex = isSakura
      ? CONFIG.VISUAL.PALETTE.SAKURA[Math.floor(hash01(x * 11, y * 9) * CONFIG.VISUAL.PALETTE.SAKURA.length)]
      : '#4f8a3a';
    const leafTint = 0.90 + hash01(x * 7, y * 11) * 0.20;
    const leaf = new THREE.Mesh(SHARED.sphere, mat(leafHex));
    leaf.position.y = (0.4 + 0.18) * scale;
    leaf.scale.setScalar(scale * leafTint);
    leaf.castShadow = true;
    group.add(leaf);
  }
  const offX = (hash01(x, y * 2) - 0.5) * 0.5;
  const offZ = (hash01(x * 3, y) - 0.5) * 0.5;
  group.position.set(x + 0.5 + offX, 0, y + 0.5 + offZ);
  group.matrixAutoUpdate = false;
  group.updateMatrix();
  return group;
}

function disposeMesh(mesh) {
  scene.remove(mesh);
  // geo/mat は SHARED + MAT_CACHE で使い回しているので dispose しない。
  // 噴水プルームはアニメレジストリからも除去 (リーク防止)
  const p = mesh.userData && mesh.userData.plume;
  if (p) {
    const i = anim.plumes.indexOf(p);
    if (i >= 0) anim.plumes.splice(i, 1);
  }
}

// =====================================================
//  差分更新
// =====================================================
function updateTiles() {
  let changed = false;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = state.grid[y][x];
      const view = tileViews[y][x];

      if (view.type !== tile.type) {
        if (view.mesh) {
          disposeMesh(view.mesh);
          view.mesh = null;
        }
        if (tile.type === 'road') {
          view.mesh = makeRoadMesh(x, y);
          scene.add(view.mesh);
        } else if (tile.type === 'residential') {
          const occ = tile.population / CONFIG.RESIDENTIAL.CAPACITY;
          view.mesh = makeResidentialMesh(x, y, occ);
          scene.add(view.mesh);
        } else if (tile.type === 'plaza') {
          view.mesh = makePlazaMesh(x, y);
          scene.add(view.mesh);
        }
        view.type = tile.type;
        changed = true;
      }

      // 街路樹
      const wantsTree = tile.type === 'empty' && hash01(x * 0.7, y * 0.7) < 0.13;
      if (wantsTree && !view.tree) {
        view.tree = makeTreeMesh(x, y);
        scene.add(view.tree);
        changed = true;
      } else if (!wantsTree && view.tree) {
        disposeMesh(view.tree);
        view.tree = null;
        changed = true;
      }
    }
  }
  if (changed) {
    rebuildWindows();
    rebuildParkedCars();
    rebuildRoadList();
    tilesDirty = true;
  }
}

export function render() {
  const now = performance.now();
  // タブ復帰時のワープ防止に dt をクランプ
  const dt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;
  anim.t = now / 1000;

  if (controls) controls.update();
  updateTiles();
  animateDecor(dt);
  if (tilesDirty) {
    renderer.shadowMap.needsUpdate = true;
    tilesDirty = false;
  }
  renderer.render(scene, camera);
}

// =====================================================
//  ヒットテスト - 画面座標 → グリッド座標
// =====================================================
export function screenToTile(event) {
  const rect = $canvas.getBoundingClientRect();
  const point = event.touches ? event.touches[0] : event;
  pointer.x =  ((point.clientX - rect.left) / rect.width)  * 2 - 1;
  pointer.y = -((point.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(groundMesh);
  if (hits.length === 0) return { x: -1, y: -1 };
  const p = hits[0].point;
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.z);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return { x: -1, y: -1 };
  return { x: tx, y: ty };
}
