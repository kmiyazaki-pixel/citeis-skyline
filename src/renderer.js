// =====================================================
//  描画 - Three.js で 3D シーンを構築・更新
//   ・他のファイルから scene/camera を直接触らない
//   ・タイルは tileViews[y][x] に持って差分更新する
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
let colors = null;
const tileViews = []; // tileViews[y][x] = { type, mesh, tree }

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

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
    grass:            cssColor('--grass'),
    grassShadow:      cssColor('--grass-shadow'),
    road:             cssColor('--road'),
    roadLine:         cssColor('--road-line'),
    residential:      cssColor('--residential'),
    residentialLight: cssColor('--residential-light'),
  };
}

export function setupCanvas() {
  loadColors();

  renderer = new THREE.WebGLRenderer({
    canvas: $canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
  // 左クリック/シングルタップは設置に空ける
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

  // ライト: アンビ + ヘミ + 太陽 (影付き)
  scene.add(new THREE.AmbientLight(0xffffff, 0.30));
  scene.add(new THREE.HemisphereLight(0xb8e0f0, 0x4a5c34, 0.50));
  const sun = new THREE.DirectionalLight(0xfff4d6, 0.90);
  sun.position.set(W * 0.6, H * 1.8, H * 0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const d = Math.max(W, H) * 0.75;
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

  // 地面 (高低ノイズ + フラットシェーディングで単色平面感を消す)
  const groundGeo = new THREE.PlaneGeometry(W, H, W, H);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const noise = (Math.sin(x * 1.7 + y * 0.6) + Math.cos(y * 1.3 - x * 0.4)) * 0.06;
    pos.setZ(i, noise);
  }
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshLambertMaterial({ color: colors.grass, flatShading: true });
  groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(W / 2, 0, H / 2);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // グリッド線
  const grid = new THREE.GridHelper(W, W, 0x000000, 0x000000);
  grid.material.opacity = 0.10;
  grid.material.transparent = true;
  grid.position.set(W / 2, 0.06, H / 2);
  scene.add(grid);

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
//  タイル別メッシュ生成
// =====================================================
function makeRoadMesh(x, y) {
  const group = new THREE.Group();
  // 歩道 (タイル全体)
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xa8a8a8 });
  const sw = new THREE.Mesh(new THREE.BoxGeometry(1, 0.10, 1), sidewalkMat);
  sw.position.y = 0.05;
  sw.receiveShadow = true;
  group.add(sw);
  // 道路本体 (歩道の上に少し細く)
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.06, 0.82),
    new THREE.MeshLambertMaterial({ color: colors.road })
  );
  road.position.y = 0.13;
  road.receiveShadow = true;
  group.add(road);
  // 中央の白い破線 (3つ)
  const lineGeo = new THREE.BoxGeometry(0.18, 0.01, 0.06);
  const lineMat = new THREE.MeshBasicMaterial({ color: colors.roadLine });
  for (const dz of [-0.30, 0, 0.30]) {
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(0, 0.17, dz);
    group.add(line);
  }
  group.position.set(x + 0.5, 0, y + 0.5);
  return group;
}

function residentialHeight(occupancy, x, y) {
  const jitter = 0.85 + hash01(x, y) * 0.30; // 0.85 - 1.15
  return (1.0 + occupancy * 2.5) * jitter;
}

function makeResidentialMesh(x, y, occupancy) {
  const group = new THREE.Group();
  const h = residentialHeight(occupancy, x, y);
  // 本体
  const bodyGeo = new THREE.BoxGeometry(0.82, 1, 0.82);
  const color = new THREE.Color().lerpColors(colors.residentialLight, colors.residential, occupancy);
  const tint = 0.92 + hash01(x + 1, y) * 0.16;
  color.r = Math.min(1, color.r * tint);
  color.g = Math.min(1, color.g * tint);
  color.b = Math.min(1, color.b * tint);
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.y = h;
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // ピラミッド屋根 (色も少しジッター)
  const roofTint = 0.85 + hash01(x, y + 1) * 0.30;
  const roofColor = new THREE.Color(0x6b3d2e).multiplyScalar(roofTint);
  const roofGeo = new THREE.ConeGeometry(0.62, 0.5, 4);
  const roofMat = new THREE.MeshLambertMaterial({ color: roofColor });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = h + 0.25;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  // 窓 (前後)
  const winGeo = new THREE.BoxGeometry(0.10, 0.10, 0.04);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffe680 });
  const wy = h * 0.55;
  for (const [px, pz] of [[-0.20, 0.42], [0.20, 0.42], [-0.20, -0.42], [0.20, -0.42]]) {
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(px, wy, pz);
    group.add(win);
  }
  // 窓 (側面)
  const winSideGeo = new THREE.BoxGeometry(0.04, 0.10, 0.10);
  for (const px of [-0.42, 0.42]) {
    const win = new THREE.Mesh(winSideGeo, winMat);
    win.position.set(px, wy, 0);
    group.add(win);
  }
  group.position.set(x + 0.5, 0, y + 0.5);
  group.userData.body = body;
  group.userData.roof = roof;
  return group;
}

function makeTreeMesh(x, y) {
  const group = new THREE.Group();
  const scale = 0.85 + hash01(x * 5, y * 3) * 0.4;
  const trunkGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.4);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 0.2 * scale;
  trunk.scale.y = scale;
  trunk.castShadow = true;
  group.add(trunk);
  const leafGeo = new THREE.SphereGeometry(0.26, 8, 6);
  const leafTint = 0.85 + hash01(x * 7, y * 11) * 0.25;
  const leafMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x4f8a3a).multiplyScalar(leafTint) });
  const leaf = new THREE.Mesh(leafGeo, leafMat);
  leaf.position.y = (0.4 + 0.18) * scale;
  leaf.scale.setScalar(scale);
  leaf.castShadow = true;
  group.add(leaf);
  const offsetX = (hash01(x, y * 2) - 0.5) * 0.5;
  const offsetZ = (hash01(x * 3, y) - 0.5) * 0.5;
  group.position.set(x + 0.5 + offsetX, 0, y + 0.5 + offsetZ);
  return group;
}

function disposeMesh(mesh) {
  scene.remove(mesh);
  mesh.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
}

function updateTiles() {
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
        }
        view.type = tile.type;
      } else if (tile.type === 'residential' && view.mesh) {
        const occ = tile.population / CONFIG.RESIDENTIAL.CAPACITY;
        const h = residentialHeight(occ, x, y);
        const body = view.mesh.userData.body;
        const roof = view.mesh.userData.roof;
        body.scale.y = h;
        body.position.y = h / 2;
        body.material.color.lerpColors(colors.residentialLight, colors.residential, occ);
        const tint = 0.92 + hash01(x + 1, y) * 0.16;
        body.material.color.multiplyScalar(tint);
        roof.position.y = h + 0.25;
      }

      // 街路樹: 空タイルでハッシュが当たれば生やす、何か置かれたら除去
      const wantsTree = tile.type === 'empty' && hash01(x * 0.7, y * 0.7) < 0.13;
      if (wantsTree && !view.tree) {
        view.tree = makeTreeMesh(x, y);
        scene.add(view.tree);
      } else if (!wantsTree && view.tree) {
        disposeMesh(view.tree);
        view.tree = null;
      }
    }
  }
}

export function render() {
  if (controls) controls.update();
  updateTiles();
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
