// =====================================================
//  音 - WebAudio のオシレーターで効果音を合成
//  (音源ファイルは使わない。AudioContext はユーザー操作後に生成)
// =====================================================

let ctx = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (_) {
    ctx = null; // 音なしでも続行
  }
}

// suspended のままなら復帰を試みる (play は必ずユーザー操作起点なので成功する)
function ensureAudio() {
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume();
  return ctx.state === 'running';
}

// クリスタル取得音: 短い上昇アルペジオ
export function playPickup() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  for (const [i, freq] of [[0, 880], [1, 1174.7], [2, 1568]]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + i * 0.07);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.07 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.07 + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + i * 0.07);
    osc.stop(t0 + i * 0.07 + 0.25);
  }
}

// ジャンプ音: 短いポップ
export function playJump() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(300, t0);
  osc.frequency.exponentialRampToValueAtTime(560, t0 + 0.12);
  gain.gain.setValueAtTime(0.12, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.18);
}
