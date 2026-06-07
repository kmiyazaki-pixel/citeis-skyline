// =====================================================
//  描画 - Three.js で 3D シーンを構築・更新
//   ・他のファイルから scene/camera を直接触らない
//   ・タイルは tileViews[y][x] に持って差分更新する
//   ・geometry/material は共有 (SHARED + MAT_CACHE)
//   ・窓は scene 全体で 1 つの InstancedMesh
// =====================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';
import { CONFIG } from './config.js';
import { $canvas } from './dom.js';

const W = CONFIG.GRID.WIDTH;
const H = CONFIG.GRID.HEIGHT;

let renderer, scene, camera, controls;
let groundMesh;
let windowsMesh;          // InstancedMesh, 全建物の窓を 1 つで描画
let colors = null;
const tileViews = [];     // tileViews[y][x] = { type, mesh, tree }
let tilesDirty = true;    // 影マップを更新するかどうか

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// 共有ジオメトリ (使い回しで dispose しない)
const SHARED = {
  box:    new THREE.BoxGeometry(1, 1, 1),
  plane:  new THREE.PlaneGeometry(1, 1),
  cone4:  new THREE.ConeGeometry(0.62, 0.5, 4),
  cone8:  new THREE.ConeGeometry(0.05, 0.4, 8),
  cyl:    new THREE.CylinderGeometry(1, 1, 1, 8),
  sphere: new THREE.SphereGeometry(0.26, 8, 6),
};

// マテリアルキャッシュ (色ごとに 1 つ)
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
  renderer.shadowMap.autoUpdate = false; // 変更時のみ更新

  $canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.error('[renderer] WebGL context lost');
  });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb8e0f0);
  scene.fog = new THREE.Fog(0xb8e0f0, W * 1.6, W * 4);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
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

  // 地面
  const groundGeo = new THREE.PlaneGeometry(W, H, W, H);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, (Math.sin(x * 1.7 + y * 0.6) + Math.cos(y * 1.3 - x * 0.4)) * 0.06);
  }
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshLambertMaterial({ color: colors.grass, flatShading: true });
  groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(W / 2, 0, H / 2);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // 川 (片側の自動装飾)
  addRiverEdge();

  // グリッド線
  const grid = new THREE.GridHelper(W, W, 0x000000, 0x000000);
  grid.material.opacity = 0.10;
  grid.material.transparent = true;
  grid.position.set(W / 2, 0.06, H / 2);
  scene.add(grid);

  // 全建物の窓を 1 つの InstancedMesh で
  initWindows();

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
//  川 (グリッドの上端に流す)
// =====================================================
function addRiverEdge() {
  const geo = new THREE.PlaneGeometry(W + 8, 5, 32, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, Math.sin(pos.getX(i) * 0.6) * 0.04);
  }
  geo.computeVertexNormals();
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
//   中心からの距離が短いほど高層になりやすい
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
//  InstancedMesh の窓
// =====================================================
const _dummyObj = new THREE.Object3D();
function initWindows() {
  const geo = new THREE.BoxGeometry(0.08, 0.10, 0.02);
  const winMat = new THREE.MeshLambertMaterial({
    color: CONFIG.VISUAL.PALETTE.WINDOW_LIT,
    emissive: 0x442200,
    emissiveIntensity: 0.4,
  });
  windowsMesh = new THREE.InstancedMesh(geo, winMat, CONFIG.VISUAL.MAX_WINDOWS);
  windowsMesh.count = 0;
  windowsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  windowsMesh.castShadow = false;
  windowsMesh.receiveShadow = false;
  scene.add(windowsMesh);
}

// 全タイルをスキャンして InstancedMesh に窓を流し込む
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
      // 階層数だけ縦に配置 (見える 4 面の中央 2 列)
      for (let row = 0; row < tier; row++) {
        const yy = (row + 0.5) * (h / tier);
        // 4 面: 前 (z+), 後 (z-), 右 (x+), 左 (x-)
        const faces = [
          [0,  halfWall + 0.012, 0, 1, 0],   // dz +
          [0, -halfWall - 0.012, 0, 1, Math.PI],
          [ halfWall + 0.012, 0, 0, 0, Math.PI / 2],
          [-halfWall - 0.012, 0, 0, 0, -Math.PI / 2],
        ];
        for (const [dx, dz, _ignore, _o, rotY] of faces) {
          // 2 列 (左右にオフセット)
          for (const col of [-wall * 0.22, wall * 0.22]) {
            if (count >= CONFIG.VISUAL.MAX_WINDOWS) {
              windowsMesh.count = count;
              windowsMesh.instanceMatrix.needsUpdate = true;
              return;
            }
            const isXFace = Math.abs(dx) > 0.01;
            const wx = baseX + dx + (isXFace ? 0 : col);
            const wz = baseZ + dz + (isXFace ? col : 0);
            _dummyObj.position.set(wx, yy, wz);
            _dummyObj.rotation.set(0, rotY, 0);
            _dummyObj.updateMatrix();
            windowsMesh.setMatrixAt(count, _dummyObj.matrix);
            count++;
          }
        }
      }
    }
  }
  windowsMesh.count = count;
  windowsMesh.instanceMatrix.needsUpdate = true;
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
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
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
    // 低層: 本体 + ピラミッド屋根
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
    // 噴水: 基盤 + 水盤 + 噴き上がりコーン
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
  // 桜 / 通常
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
  const offX = (hash01(x, y * 2) - 0.5) * 0.5;
  const offZ = (hash01(x * 3, y) - 0.5) * 0.5;
  group.position.set(x + 0.5 + offX, 0, y + 0.5 + offZ);
  group.matrixAutoUpdate = false;
  group.updateMatrix();
  return group;
}

function disposeMesh(mesh) {
  scene.remove(mesh);
  // geo/mat は SHARED + MAT_CACHE で使い回しているので dispose しない
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
    tilesDirty = true;
  }
}

export function render() {
  if (controls) controls.update();
  updateTiles();
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
