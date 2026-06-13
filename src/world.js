// =====================================================
//  ワールド - プロシージャル地形のチャンク管理
//   ・heightAt(x, z) が地形の唯一の真実 (描画も物理も同じ式)
//   ・チャンクはプレイヤー周囲に生成し、離れたら破棄
//   ・木/岩/花は チャンクごとの InstancedMesh
//   ・クリスタルは個別メッシュ (取得・アニメがあるため)
// =====================================================

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { fbm, valueNoise, hash2 } from './noise.js';
import { scene, isMobile } from './engine.js';

const SIZE = CONFIG.WORLD.CHUNK_SIZE;
const SEG = CONFIG.WORLD.CHUNK_SEGMENTS;
const R = CONFIG.WORLD.VIEW_RADIUS;

const chunks = new Map();        // "cx,cz" → { group, uniqueGeos, ims, crystals }
const buildQueue = [];           // [cx, cz] の生成待ち
const queuedKeys = new Set();
const collectedCrystals = new Set(); // "cx,cz,i" 取得済みクリスタル

let water = null;
let elapsed = 0;

// ---------- 高さ関数 (地形の唯一の真実) ----------
export function heightAt(x, z) {
  const T = CONFIG.TERRAIN;
  const n = fbm(x * T.SCALE, z * T.SCALE, T.OCTAVES, T.LACUNARITY, T.GAIN, T.SEED);
  return Math.pow(n, T.POW) * T.HEIGHT;
}

// ---------- 共有ジオメトリ / マテリアル ----------
const GEO = {
  trunk: new THREE.CylinderGeometry(0.12, 0.18, 1, 6),
  pine: new THREE.ConeGeometry(0.95, 2.4, 7),
  leaf: new THREE.SphereGeometry(1.0, 7, 5),
  rock: new THREE.DodecahedronGeometry(0.7, 0),
  flower: new THREE.SphereGeometry(0.1, 5, 4),
  crystal: new THREE.OctahedronGeometry(0.42),
};

const MAT = {
  terrain: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2e, flatShading: true }),
  pine: new THREE.MeshLambertMaterial({ color: 0x2e6b3e, flatShading: true }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x55a04f, flatShading: true }),
  sakura: new THREE.MeshLambertMaterial({ color: 0xf4b6c8, flatShading: true }),
  rock: new THREE.MeshLambertMaterial({ color: 0x8d8577, flatShading: true }),
  flower: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  crystal: new THREE.MeshLambertMaterial({
    color: 0x9ff0ff, emissive: 0x19c8e8, emissiveIntensity: 0.8,
    transparent: true, opacity: 0.92,
  }),
  water: new THREE.MeshLambertMaterial({
    color: 0x2f7fae, transparent: true, opacity: 0.72,
  }),
};

const COL = {
  sand: new THREE.Color('#e7d9a8'),
  grassA: new THREE.Color('#69b25c'),
  grassB: new THREE.Color('#4e9a4e'),
  rock: new THREE.Color('#8d8577'),
  snow: new THREE.Color('#f4f7fa'),
};
const FLOWER_COLORS = [
  new THREE.Color('#ffffff'), new THREE.Color('#ffd34d'),
  new THREE.Color('#ff8fb3'), new THREE.Color('#b48fff'),
];

const _dummy = new THREE.Object3D();
const _c = new THREE.Color();

// ---------- 初期化 ----------
export function initWorld(px, pz) {
  // 水面 (1枚をプレイヤーに追従させる)
  const wsize = (R * 2 + 4) * SIZE;
  water = new THREE.Mesh(new THREE.PlaneGeometry(wsize, wsize), MAT.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = CONFIG.WATER_LEVEL;
  scene.add(water);

  // スポーン周辺 3×3 は同期生成 (最初の景色が空にならないように)
  const cx = Math.floor(px / SIZE), cz = Math.floor(pz / SIZE);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      buildChunk(cx + dx, cz + dz);
    }
  }
}

// ---------- チャンク生成 ----------
function buildChunk(cx, cz) {
  const key = cx + ',' + cz;
  if (chunks.has(key)) return;

  const group = new THREE.Group();
  const uniqueGeos = [];
  const ims = [];
  const S = CONFIG.SCENERY;
  const seed = CONFIG.TERRAIN.SEED;

  // --- 地形メッシュ (ワールド座標を頂点に焼き込む) ---
  //   高さは先にグリッドへ一括計算し、頂点と傾斜の両方で使い回す
  //   (頂点ごとに heightAt を3回呼ぶと fbm 計算が3倍になるため)
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const step = SIZE / SEG;   // 頂点間隔
  const N = SEG + 2;         // 傾斜参照用に 1 列余分にとる
  const hg = new Float32Array(N * N);
  const x0 = cx * SIZE;
  const z0 = cz * SIZE;
  for (let gz = 0; gz < N; gz++) {
    for (let gx = 0; gx < N; gx++) {
      hg[gz * N + gx] = heightAt(x0 + gx * step, z0 + gz * step);
    }
  }
  const SLOPE_ROCK = 1.4 * (step / 0.9); // 旧 e=0.9 基準の閾値を頂点間隔に換算
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i) + SIZE / 2; // 0..SIZE
    const lz = pos.getZ(i) + SIZE / 2;
    const gx = Math.round(lx / step);
    const gz = Math.round(lz / step);
    const h = hg[gz * N + gx];
    const wx = x0 + lx;
    const wz = z0 + lz;
    pos.setX(i, wx);
    pos.setZ(i, wz);
    pos.setY(i, h);
    // 高さと傾斜で色分け (傾斜は隣接グリッド差分)
    const slope = Math.abs(hg[gz * N + gx + 1] - h) + Math.abs(hg[(gz + 1) * N + gx] - h);
    if (h < CONFIG.WATER_LEVEL + 0.5) {
      _c.copy(COL.sand);
    } else if (slope > SLOPE_ROCK) {
      _c.copy(COL.rock);
    } else if (h > 11.5) {
      _c.copy(COL.snow);
    } else {
      _c.lerpColors(COL.grassA, COL.grassB, valueNoise(wx * 0.15, wz * 0.15, 7));
    }
    colors[i * 3] = _c.r;
    colors[i * 3 + 1] = _c.g;
    colors[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // flatShading はシェーダ内で面法線を導出するため法線計算は不要
  const terrain = new THREE.Mesh(geo, MAT.terrain);
  terrain.receiveShadow = true;
  group.add(terrain);
  uniqueGeos.push(geo);

  // --- 木 / 岩 / 花 の配置候補を決定的に作る ---
  const trees = [];   // { x, z, h, kind: 'pine'|'leaf'|'sakura', s }
  for (let i = 0; i < S.TREES_PER_CHUNK; i++) {
    const rx = hash2(cx * 131 + i, cz * 173 + i * 7, seed + 11);
    const rz = hash2(cx * 197 + i * 3, cz * 139 + i, seed + 23);
    const wx = cx * SIZE + rx * SIZE;
    const wz = cz * SIZE + rz * SIZE;
    const h = heightAt(wx, wz);
    if (h < CONFIG.WATER_LEVEL + 0.6 || h > S.TREE_MAX_HEIGHT) continue;
    const e = 0.9;
    const slope = Math.abs(heightAt(wx + e, wz) - h) + Math.abs(heightAt(wx, wz + e) - h);
    if (slope > S.TREE_MAX_SLOPE) continue;
    const kindR = hash2(i * 31, cx * 7 + cz * 13, seed + 37);
    const kind = kindR < S.SAKURA_RATIO ? 'sakura'
               : kindR < S.SAKURA_RATIO + S.PINE_RATIO ? 'pine' : 'leaf';
    const s = 0.8 + hash2(i * 17, cx * 3 + cz * 11, seed + 41) * 0.7;
    trees.push({ x: wx, z: wz, h, kind, s });
  }

  // --- 幹 InstancedMesh ---
  if (trees.length > 0) {
    const trunkIM = new THREE.InstancedMesh(GEO.trunk, MAT.trunk, trees.length);
    trunkIM.castShadow = !isMobile;
    trees.forEach((t, i) => {
      const trunkH = 1.4 * t.s;
      _dummy.position.set(t.x, t.h + trunkH / 2, t.z);
      _dummy.scale.set(t.s, trunkH, t.s);
      _dummy.rotation.set(0, hash2(i, 5, seed) * Math.PI, 0);
      _dummy.updateMatrix();
      trunkIM.setMatrixAt(i, _dummy.matrix);
    });
    // インスタンス行列はチャンク生成後に変わらないので、境界球を一度
    // 計算しておけばカメラと影の両パスでフラスタムカリングが効く
    trunkIM.computeBoundingSphere();
    group.add(trunkIM);
    ims.push(trunkIM);

    // --- 葉 (種類ごとに InstancedMesh) ---
    for (const [kind, geoLeaf, matLeaf] of [
      ['pine', GEO.pine, MAT.pine],
      ['leaf', GEO.leaf, MAT.leaf],
      ['sakura', GEO.leaf, MAT.sakura],
    ]) {
      const list = trees.filter(t => t.kind === kind);
      if (list.length === 0) continue;
      const im = new THREE.InstancedMesh(geoLeaf, matLeaf, list.length);
      im.castShadow = !isMobile;
      list.forEach((t, i) => {
        const trunkH = 1.4 * t.s;
        const y = kind === 'pine' ? t.h + trunkH + 1.0 * t.s : t.h + trunkH + 0.7 * t.s;
        _dummy.position.set(t.x, y, t.z);
        _dummy.scale.setScalar(t.s);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        im.setMatrixAt(i, _dummy.matrix);
      });
      im.computeBoundingSphere();
      group.add(im);
      ims.push(im);
    }
  }

  // --- 岩 ---
  const rocks = [];
  for (let i = 0; i < S.ROCKS_PER_CHUNK; i++) {
    const wx = cx * SIZE + hash2(cx * 61 + i * 5, cz * 67 + i, seed + 53) * SIZE;
    const wz = cz * SIZE + hash2(cx * 71 + i, cz * 83 + i * 3, seed + 59) * SIZE;
    const h = heightAt(wx, wz);
    if (h < CONFIG.WATER_LEVEL + 0.3) continue;
    rocks.push({ x: wx, z: wz, h, s: 0.5 + hash2(i * 13, cx + cz, seed + 61) * 1.3 });
  }
  if (rocks.length > 0) {
    const im = new THREE.InstancedMesh(GEO.rock, MAT.rock, rocks.length);
    im.castShadow = false; // 岩は半埋まりで影の寄与が小さい (シャドウパス節約)
    rocks.forEach((r, i) => {
      _dummy.position.set(r.x, r.h + r.s * 0.2, r.z);
      _dummy.scale.setScalar(r.s);
      _dummy.rotation.set(hash2(i, 1, seed) * 3, hash2(i, 2, seed) * 3, hash2(i, 3, seed) * 3);
      _dummy.updateMatrix();
      im.setMatrixAt(i, _dummy.matrix);
    });
    im.computeBoundingSphere();
    group.add(im);
    ims.push(im);
  }

  // --- 花 (草地のみ、instanceColor で多色) ---
  const flowers = [];
  for (let i = 0; i < S.FLOWERS_PER_CHUNK; i++) {
    const wx = cx * SIZE + hash2(cx * 91 + i * 7, cz * 97 + i, seed + 71) * SIZE;
    const wz = cz * SIZE + hash2(cx * 101 + i, cz * 103 + i * 9, seed + 73) * SIZE;
    const h = heightAt(wx, wz);
    if (h < CONFIG.WATER_LEVEL + 0.6 || h > 10) continue;
    flowers.push({ x: wx, z: wz, h, ci: Math.floor(hash2(i, cx * 5 + cz, seed + 79) * FLOWER_COLORS.length) });
  }
  if (flowers.length > 0) {
    const im = new THREE.InstancedMesh(GEO.flower, MAT.flower, flowers.length);
    flowers.forEach((f, i) => {
      _dummy.position.set(f.x, f.h + 0.1, f.z);
      _dummy.scale.setScalar(1);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      im.setMatrixAt(i, _dummy.matrix);
      im.setColorAt(i, FLOWER_COLORS[f.ci]);
    });
    im.computeBoundingSphere();
    group.add(im);
    ims.push(im);
  }

  // --- クリスタル (個別メッシュ: 回転 + 取得があるため) ---
  const crystals = [];
  for (let i = 0; i < S.CRYSTALS_PER_CHUNK; i++) {
    const ckey = key + ',' + i;
    if (collectedCrystals.has(ckey)) continue;
    const wx = cx * SIZE + hash2(cx * 111 + i * 11, cz * 113 + i, seed + 83) * SIZE;
    const wz = cz * SIZE + hash2(cx * 121 + i, cz * 127 + i * 13, seed + 89) * SIZE;
    const h = heightAt(wx, wz);
    if (h < CONFIG.WATER_LEVEL + 0.3) continue;
    const mesh = new THREE.Mesh(GEO.crystal, MAT.crystal);
    const baseY = h + 0.9;
    mesh.position.set(wx, baseY, wz);
    group.add(mesh);
    crystals.push({ mesh, key: ckey, baseY, phase: hash2(i, cx + cz * 3, seed + 97) * Math.PI * 2 });
  }

  scene.add(group);
  chunks.set(key, { group, uniqueGeos, ims, crystals });
}

function disposeChunk(key) {
  const chunk = chunks.get(key);
  if (!chunk) return;
  scene.remove(chunk.group);
  for (const g of chunk.uniqueGeos) g.dispose();
  for (const im of chunk.ims) im.dispose(); // instanceMatrix 等のバッファ解放 (共有 geo は保持)
  chunks.delete(key);
}

// ---------- 毎フレーム更新 ----------
//   戻り値: このフレームで取得したクリスタル数
let lastPcx = Infinity;
let lastPcz = Infinity;

export function updateWorld(dt, playerPos) {
  elapsed += dt;

  // チャンクの読み込み / 破棄 (スキャンは境界をまたいだ時だけ)
  const pcx = Math.floor(playerPos.x / SIZE);
  const pcz = Math.floor(playerPos.z / SIZE);
  if (pcx !== lastPcx || pcz !== lastPcz) {
    lastPcx = pcx;
    lastPcz = pcz;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const key = (pcx + dx) + ',' + (pcz + dz);
        if (!chunks.has(key) && !queuedKeys.has(key)) {
          buildQueue.push([pcx + dx, pcz + dz]);
          queuedKeys.add(key);
        }
      }
    }
    for (const key of [...chunks.keys()]) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > R + 1 || Math.abs(cz - pcz) > R + 1) disposeChunk(key);
    }
  }
  // 生成は毎フレーム少しずつ (モバイルは1個に律速してヒッチ防止)
  const maxBuilds = isMobile ? 1 : CONFIG.WORLD.MAX_CHUNK_BUILDS_PER_FRAME;
  let built = 0;
  while (buildQueue.length > 0 && built < maxBuilds) {
    const [cx, cz] = buildQueue.shift();
    queuedKeys.delete(cx + ',' + cz);
    // キュー滞在中に範囲外へ出ていたらスキップ
    if (Math.abs(cx - pcx) > R || Math.abs(cz - pcz) > R) continue;
    buildChunk(cx, cz);
    built++;
  }

  // 水面はプレイヤーに追従
  if (water) {
    water.position.x = playerPos.x;
    water.position.z = playerPos.z;
    water.position.y = CONFIG.WATER_LEVEL + Math.sin(elapsed * 0.8) * 0.06;
  }

  // クリスタルのアニメ + 取得判定
  let picked = 0;
  for (const chunk of chunks.values()) {
    for (const cr of chunk.crystals) {
      if (!cr.mesh.parent) continue;
      cr.mesh.rotation.y += dt * 2;
      cr.mesh.position.y = cr.baseY + Math.sin(elapsed * 2 + cr.phase) * 0.18;
      const dx = cr.mesh.position.x - playerPos.x;
      const dy = cr.mesh.position.y - (playerPos.y + 1);
      const dz = cr.mesh.position.z - playerPos.z;
      if (dx * dx + dy * dy + dz * dz < CONFIG.PICKUP_DIST * CONFIG.PICKUP_DIST) {
        chunk.group.remove(cr.mesh);
        collectedCrystals.add(cr.key);
        picked++;
      }
    }
  }
  return picked;
}
