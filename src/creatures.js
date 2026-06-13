// =====================================================
//  生き物 - 野ウサギ (スポーン地点周辺を跳ねまわる)
//   プレイヤーが近づくと逃げる。装飾であり攻撃などはない
// =====================================================

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { scene } from './engine.js';
import { heightAt } from './world.js';
import { hash2 } from './noise.js';

const rabbits = [];
let home = { x: 0, z: 0 };

function buildRabbitMesh(tint) {
  const g = new THREE.Group();
  const color = new THREE.Color('#e8e0d4').multiplyScalar(tint);
  const matBody = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.5), matBody);
  body.position.y = 0.22;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.24), matBody);
  head.position.set(0, 0.4, 0.28);
  g.add(head);
  for (const ex of [-0.07, 0.07]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.04), matBody);
    ear.position.set(ex, 0.62, 0.26);
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4),
    new THREE.MeshLambertMaterial({ color: 0xffffff }));
  tail.position.set(0, 0.24, -0.27);
  g.add(tail);
  return g;
}

export function setupCreatures(px, pz) {
  home = { x: px, z: pz };
  for (let i = 0; i < CONFIG.CREATURES.RABBITS; i++) {
    const angle = hash2(i, 1, 5) * Math.PI * 2;
    const dist = 10 + hash2(i, 2, 5) * 40;
    const x = px + Math.cos(angle) * dist;
    const z = pz + Math.sin(angle) * dist;
    const mesh = buildRabbitMesh(0.85 + hash2(i, 3, 5) * 0.3);
    mesh.position.set(x, heightAt(x, z), z);
    scene.add(mesh);
    rabbits.push({
      mesh,
      x, z,
      vy: 0,
      y: heightAt(x, z),
      target: null,
      waitTimer: hash2(i, 4, 5) * 2,
    });
  }
}

export function updateCreatures(dt, playerPos) {
  const C = CONFIG.CREATURES;
  // 遠すぎたら更新しない (負荷削減)
  const dHome = Math.hypot(playerPos.x - home.x, playerPos.z - home.z);
  if (dHome > C.SLEEP_DIST) return;

  for (const r of rabbits) {
    const dpx = r.x - playerPos.x;
    const dpz = r.z - playerPos.z;
    const playerDist = Math.hypot(dpx, dpz);

    const grounded = r.mesh.position.y <= r.y + 0.01;

    if (grounded) {
      if (playerDist < C.FLEE_DIST) {
        // プレイヤーから逃げる方向へすぐ跳ぶ
        const inv = 1 / Math.max(0.001, playerDist);
        r.target = { x: r.x + dpx * inv * 6, z: r.z + dpz * inv * 6 };
        r.waitTimer = 0;
      }
      if (r.waitTimer > 0) {
        r.waitTimer -= dt;
      } else {
        if (!r.target) {
          // 行動範囲内のランダムな地点へ
          const a = Math.random() * Math.PI * 2;
          const d = 2 + Math.random() * 6;
          let tx = r.x + Math.cos(a) * d;
          let tz = r.z + Math.sin(a) * d;
          // 範囲外や水場なら home 方向へ
          if (Math.hypot(tx - home.x, tz - home.z) > C.ROAM_RADIUS ||
              heightAt(tx, tz) < CONFIG.WATER_LEVEL + 0.3) {
            tx = r.x + (home.x - r.x) * 0.2;
            tz = r.z + (home.z - r.z) * 0.2;
          }
          r.target = { x: tx, z: tz };
        }
        // 跳躍開始
        r.vy = 4.2;
        r.mesh.rotation.y = Math.atan2(r.target.x - r.x, r.target.z - r.z);
      }
    }

    // 空中: 放物線でターゲットへ
    if (r.vy !== 0 || !grounded) {
      if (r.target) {
        const tdx = r.target.x - r.x;
        const tdz = r.target.z - r.z;
        const tlen = Math.hypot(tdx, tdz);
        if (tlen > 0.1) {
          const step = Math.min(tlen, 3.0 * dt);
          r.x += (tdx / tlen) * step;
          r.z += (tdz / tlen) * step;
        }
      }
      r.vy -= 14 * dt;
      r.mesh.position.y += r.vy * dt;
      r.y = heightAt(r.x, r.z);
      if (r.mesh.position.y <= r.y) {
        r.mesh.position.y = r.y;
        r.vy = 0;
        if (r.target && Math.hypot(r.target.x - r.x, r.target.z - r.z) < 0.5) {
          r.target = null;
          r.waitTimer = 0.6 + Math.random() * 2.2;
        }
      }
    }

    r.mesh.position.x = r.x;
    r.mesh.position.z = r.z;
  }
}
