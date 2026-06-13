// =====================================================
//  構造物 - 拠点の建物キット (プリミティブのみ)
//   ・地形ジオメトリには焼かず、プレイヤーデータ (state.structures) を
//     シーンのメッシュに反映するだけ
//   ・構造物は数が少ない前提でシーンに常駐 (チャンク間引きしない)
//   ・各メッシュは「親グループの原点 = 設置点の地面高さ」基準で組み、
//     親の position.y = heightAt(x,z) で接地させる (ゴーストの移動も容易)
// =====================================================

import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './engine.js';
import { heightAt } from './world.js';

let group = null;                 // 全構造物の親
const meshById = new Map();       // id → mesh

const GEO = {
  slab: new THREE.CylinderGeometry(1.5, 1.6, 0.18, 8),
  trim: new THREE.TorusGeometry(1.52, 0.08, 8, 8),
  post: new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8),
  skirt: new THREE.CylinderGeometry(1.45, 1.7, 1.2, 8),
  // 小屋
  body: new THREE.BoxGeometry(2.4, 1.6, 2.0),
  roof: new THREE.ConeGeometry(1.95, 1.1, 4),
  door: new THREE.BoxGeometry(0.5, 0.9, 0.12),
  window: new THREE.BoxGeometry(0.5, 0.5, 0.1),
  // かまど
  furnace: new THREE.BoxGeometry(1.4, 1.0, 1.4),
  chimney: new THREE.CylinderGeometry(0.22, 0.3, 1.3, 8),
  ember: new THREE.BoxGeometry(0.55, 0.45, 0.12),
  // 橋
  deck: new THREE.BoxGeometry(2.0, 0.18, 4.4),
  rail: new THREE.BoxGeometry(0.1, 0.4, 4.4),
  railPost: new THREE.BoxGeometry(0.14, 0.55, 0.14),
  // 灯り
  lampPost: new THREE.CylinderGeometry(0.07, 0.1, 1.9, 8),
  lamp: new THREE.OctahedronGeometry(0.24),
};
const MAT = {
  stone: new THREE.MeshStandardMaterial({ color: 0xc7bfae, roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.85 }),
  skirt: new THREE.MeshStandardMaterial({ color: 0x6b5640, roughness: 1 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xe7dabf, roughness: 0.9 }),
  roof: new THREE.MeshStandardMaterial({ color: 0xa8483a, roughness: 0.85, flatShading: true }),
  darkwood: new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 0.85 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfe6ee, roughness: 0.4, emissive: 0x335566, emissiveIntensity: 0.3 }),
  ember: new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a10, emissiveIntensity: 1.4 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffcf6a, emissiveIntensity: 1.6 }),
};

function mesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 土台 (子は原点=地面基準。親 position.y で接地)
function makeFoundation(data) {
  const g = new THREE.Group();

  const skirt = new THREE.Mesh(GEO.skirt, MAT.skirt);
  skirt.position.y = -0.42; // 上面が床に来るよう下へ伸ばす
  skirt.receiveShadow = true;
  g.add(skirt);

  const slab = new THREE.Mesh(GEO.slab, MAT.stone);
  slab.position.y = 0.18;
  slab.castShadow = true;
  slab.receiveShadow = true;
  g.add(slab);

  const trim = new THREE.Mesh(GEO.trim, MAT.wood);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.27;
  g.add(trim);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const post = new THREE.Mesh(GEO.post, MAT.wood);
    post.position.set(Math.cos(a) * 1.25, 0.4, Math.sin(a) * 1.25);
    post.castShadow = true;
    g.add(post);
  }

  g.position.set(data.x, heightAt(data.x, data.z), data.z);
  g.rotation.y = data.rot || 0;
  return g;
}

// 小屋
function makeCottage(data) {
  const g = new THREE.Group();
  g.add(mesh(GEO.body, MAT.wall, 0, 0.8, 0));
  const roof = mesh(GEO.roof, MAT.roof, 0, 2.15, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.add(mesh(GEO.door, MAT.darkwood, 0, 0.45, 1.01));
  g.add(mesh(GEO.window, MAT.glass, -0.7, 1.0, 1.01));
  g.add(mesh(GEO.window, MAT.glass, 0.7, 1.0, 1.01));
  g.position.set(data.x, heightAt(data.x, data.z), data.z);
  g.rotation.y = data.rot || 0;
  return g;
}

// かまど
function makeFurnace(data) {
  const g = new THREE.Group();
  g.add(mesh(GEO.furnace, MAT.stone, 0, 0.5, 0));
  g.add(mesh(GEO.chimney, MAT.stone, 0.4, 1.55, -0.2));
  const ember = mesh(GEO.ember, MAT.ember, 0, 0.4, 0.71);
  ember.castShadow = false;
  g.add(ember);
  g.position.set(data.x, heightAt(data.x, data.z), data.z);
  g.rotation.y = data.rot || 0;
  return g;
}

// 橋
function makeBridge(data) {
  const g = new THREE.Group();
  g.add(mesh(GEO.deck, MAT.wood, 0, 0.25, 0));
  for (const side of [-0.95, 0.95]) {
    g.add(mesh(GEO.rail, MAT.darkwood, side, 0.6, 0));
    for (const pz of [-2.0, 0, 2.0]) g.add(mesh(GEO.railPost, MAT.darkwood, side, 0.5, pz));
  }
  g.position.set(data.x, heightAt(data.x, data.z), data.z);
  g.rotation.y = data.rot || 0;
  return g;
}

// 灯り
function makeLantern(data) {
  const g = new THREE.Group();
  g.add(mesh(GEO.lampPost, MAT.darkwood, 0, 0.95, 0));
  const lamp = mesh(GEO.lamp, MAT.lamp, 0, 2.0, 0);
  lamp.castShadow = false;
  g.add(lamp);
  g.position.set(data.x, heightAt(data.x, data.z), data.z);
  g.rotation.y = data.rot || 0;
  return g;
}

const FACTORY = {
  foundation: makeFoundation,
  cottage: makeCottage,
  furnace: makeFurnace,
  bridge: makeBridge,
  lantern: makeLantern,
};

function ensureGroup() {
  if (!group) {
    group = new THREE.Group();
    scene.add(group);
  }
}

export function addStructureMesh(data) {
  ensureGroup();
  const make = FACTORY[data.type] || FACTORY.foundation;
  const mesh = make(data);
  group.add(mesh);
  meshById.set(data.id, mesh);
  return mesh;
}

export function removeStructureMesh(id) {
  const mesh = meshById.get(id);
  if (!mesh) return;
  group.remove(mesh);
  meshById.delete(id);
}

// state.structures からシーンを作り直す (起動時・つづきから)
export function spawnAllStructures() {
  ensureGroup();
  for (const mesh of meshById.values()) group.remove(mesh);
  meshById.clear();
  for (const data of state.structures) addStructureMesh(data);
}

// ゴースト (半透明クローン)。build.js が位置だけ動かす
export function makeGhost(type) {
  const mesh = (FACTORY[type] || FACTORY.foundation)({ x: 0, z: 0, rot: 0 });
  mesh.traverse((o) => {
    if (o.material) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.5;
    }
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return mesh;
}
