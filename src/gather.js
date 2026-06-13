// =====================================================
//  採取 - 木を切って木材 / 岩を砕いて石
//   ・最寄りの木/岩ノードを採取 (クールダウンあり)
//   ・採取量は道具レベルで増える
//   ・累計採取数で能力を解放
// =====================================================

import { CONFIG } from './config.js';
import { state } from './state.js';
import { nearestGatherNode, heightAt } from './world.js';
import { playPickup, playJump } from './audio.js';
import { showPickupPopup, showBanner } from './hud.js';

let lastGather = -999;

// 採取を試みる (E / 採取ボタン)。できたら true
export function tryGather() {
  if (!state.started || state.paused) return false;
  const now = performance.now() / 1000;
  if (now - lastGather < CONFIG.GATHER.COOLDOWN) return false;

  const node = nearestGatherNode(state.player.pos, CONFIG.GATHER.RANGE);
  if (!node) return false;
  lastGather = now;

  const mult = 1 + state.toolLevel;
  if (node.type === 'wood') {
    const amt = CONFIG.GATHER.WOOD_BASE * mult;
    state.wood += amt;
    state.gatheredTotal += amt;
    showPickupPopup({ x: node.x, y: heightAt(node.x, node.z) + 1.4, z: node.z }, '+' + amt + ' 🪵');
  } else {
    const amt = CONFIG.GATHER.STONE_BASE * mult;
    state.stone += amt;
    state.gatheredTotal += amt;
    showPickupPopup({ x: node.x, y: heightAt(node.x, node.z) + 1.0, z: node.z }, '+' + amt + ' 🪨');
  }
  playPickup();
  checkProgress();
  return true;
}

// 道具レベルを上げる (資材を消費)。できたら true
export function upgradeTool() {
  if (state.toolLevel >= CONFIG.TOOL.MAX_LEVEL) return false;
  const cost = CONFIG.TOOL.COST[state.toolLevel];
  if (state.wood < cost.wood || state.stone < cost.stone) return false;
  state.wood -= cost.wood;
  state.stone -= cost.stone;
  state.toolLevel++;
  playJump();
  showBanner(`🔧 道具を強化！ 採取量 ×${1 + state.toolLevel}`);
  return true;
}

// 道具強化の費用 (なければ null = 最大)
export function toolUpgradeCost() {
  if (state.toolLevel >= CONFIG.TOOL.MAX_LEVEL) return null;
  return CONFIG.TOOL.COST[state.toolLevel];
}

// 累計採取数で能力を解放
function checkProgress() {
  const a = state.abilities;
  const P = CONFIG.PROGRESSION;
  if (!a.doubleJump && state.gatheredTotal >= P.DOUBLE_JUMP) {
    a.doubleJump = true;
    showBanner('✨ 2段ジャンプ 解放！ (空中でもう一度ジャンプ)');
  }
  if (!a.glide && state.gatheredTotal >= P.GLIDE) {
    a.glide = true;
    showBanner('✨ グライド 解放！ (ジャンプ長押しでゆっくり降下)');
  }
  if (!a.swim && state.gatheredTotal >= P.SWIM) {
    a.swim = true;
    showBanner('✨ 泳ぎ 解放！ (深い水で泳げる)');
  }
}
