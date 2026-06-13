// =====================================================
//  ゲーム状態 - 実行中に変化する値はぜんぶここ
// =====================================================

import { CONFIG } from './config.js';

export const state = {
  started: false,                  // タイトル画面を抜けたか
  timeOfDay: CONFIG.DAY.START,     // 0..1 (0=深夜0時, 0.5=正午)
  crystals: 0,                     // 収集したクリスタル数

  player: {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,        // カメラの水平角
    pitch: 0.35,   // カメラの俯角
    avatarYaw: 0,  // アバターの向き (移動方向へ補間)
    onGround: false,
  },

  // input.js が書き、player.js が読む
  input: {
    move: { x: 0, z: 0 },  // -1..1 (x: 右+, z: 前+)
    lookDX: 0,             // このフレームの視点移動量 (消費式)
    lookDY: 0,
    jumpQueued: false,
    jumpBufferT: 0,   // ジャンプ入力バッファの残り時間 (player.js が管理)
    running: false,
  },
};
