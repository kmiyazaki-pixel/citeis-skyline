// =====================================================
//  音 - WebAudio のオシレーター/ノイズで合成 (音源ファイルなし)
//   構成: master → { sfx, ambience } の2バス
//   ・効果音 (取得/ジャンプ/足音/着地/水しぶき)
//   ・環境音 (風 + 昼の鳥 / 夜の虫を昼夜でクロスフェード)
// =====================================================

let ctx = null;
let master = null;
let sfxBus = null;
let ambBus = null;
let noiseBuffer = null;

// 環境音ノード
let windGain = null, dayGain = null, nightGain = null;
let ambBuilt = false;
let birdTimer = 0, cricketTimer = 0;

const volumes = { master: 0.8, sfx: 1.0, ambience: 0.6 };

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    master = ctx.createGain();
    master.gain.value = volumes.master;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = volumes.sfx;
    sfxBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = volumes.ambience;
    ambBus.connect(master);
    // 共有ホワイトノイズ (足音・風に使い回す)
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } catch (_) {
    ctx = null; // 音なしでも続行
  }
}

function ensureAudio() {
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume();
  return ctx.state === 'running';
}

// 設定画面用 (Tier 2): カテゴリ音量
export function setVolume(cat, v) {
  volumes[cat] = v;
  if (!ctx) return;
  if (cat === 'master' && master) master.gain.value = v;
  if (cat === 'sfx' && sfxBus) sfxBus.gain.value = v;
  if (cat === 'ambience' && ambBus) ambBus.gain.value = v;
}

// ---------- 短いノイズバースト (足音などの素) ----------
function noiseBurst(dur, filterType, freq, gainVal, bus) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filt = ctx.createBiquadFilter();
  filt.type = filterType;
  filt.frequency.value = freq;
  const g = ctx.createGain();
  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(gainVal, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(bus || sfxBus);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// ---------- 効果音 ----------
export function playPickup() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  for (const [i, freq] of [[0, 880], [1, 1174.7], [2, 1568]]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + i * 0.07);
    gain.gain.exponentialRampToValueAtTime(0.16, t0 + i * 0.07 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.07 + 0.22);
    osc.connect(gain).connect(sfxBus);
    osc.start(t0 + i * 0.07);
    osc.stop(t0 + i * 0.07 + 0.25);
  }
}

export function playJump() {
  if (!ensureAudio()) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(300, t0);
  osc.frequency.exponentialRampToValueAtTime(560, t0 + 0.12);
  gain.gain.setValueAtTime(0.1, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
  osc.connect(gain).connect(sfxBus);
  osc.start(t0);
  osc.stop(t0 + 0.18);
}

// 足音: 地形で音色を変える ('grass'|'sand'|'snow')
export function playStep(kind) {
  if (!ensureAudio()) return;
  if (kind === 'sand') noiseBurst(0.10, 'lowpass', 800, 0.10, sfxBus);
  else if (kind === 'snow') noiseBurst(0.07, 'bandpass', 3200, 0.08, sfxBus);
  else noiseBurst(0.08, 'bandpass', 1500, 0.09, sfxBus); // grass
}

export function playLand() {
  if (!ensureAudio()) return;
  noiseBurst(0.14, 'lowpass', 500, 0.16, sfxBus);
}

export function playSplash() {
  if (!ensureAudio()) return;
  noiseBurst(0.22, 'highpass', 1800, 0.14, sfxBus);
}

// ---------- 環境音 ----------
function buildAmbience() {
  // 風: ループノイズ → lowpass。LFO で filter を揺らして突風感
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = noiseBuffer;
  windSrc.loop = true;
  const windFilt = ctx.createBiquadFilter();
  windFilt.type = 'lowpass';
  windFilt.frequency.value = 420;
  windGain = ctx.createGain();
  windGain.gain.value = 0.06;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(windFilt.frequency);
  windSrc.connect(windFilt).connect(windGain).connect(ambBus);
  windSrc.start();
  lfo.start();

  // 昼/夜のサブバス (鳥・虫の音量をここで切替)
  dayGain = ctx.createGain();
  dayGain.gain.value = 0;
  dayGain.connect(ambBus);
  nightGain = ctx.createGain();
  nightGain.gain.value = 0;
  nightGain.connect(ambBus);

  ambBuilt = true;
}

function chirp() {
  // 鳥のさえずり: 2〜3音の速いピッチスライド
  const t0 = ctx.currentTime;
  const n = 2 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    const base = 2400 + Math.random() * 1400;
    const st = t0 + i * 0.09;
    osc.frequency.setValueAtTime(base, st);
    osc.frequency.exponentialRampToValueAtTime(base * 1.4, st + 0.05);
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(0.5, st + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.08);
    osc.connect(g).connect(dayGain);
    osc.start(st);
    osc.stop(st + 0.1);
  }
}

function cricket() {
  // 虫の声: 高音の短いトリル
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 4300 + Math.random() * 300;
  for (let i = 0; i < 3; i++) {
    const st = t0 + i * 0.05;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(0.22, st + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.035);
  }
  osc.connect(g).connect(nightGain);
  osc.start(t0);
  osc.stop(t0 + 0.2);
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// 毎フレーム呼ぶ。timeOfDay で鳥/虫をクロスフェードしつつ散発的に鳴らす
export function updateAmbience(dt, timeOfDay) {
  if (!ensureAudio()) return;
  if (!ambBuilt) buildAmbience();

  const sy = Math.sin((timeOfDay - 0.25) * Math.PI * 2);
  const dayness = smoothstep(-0.08, 0.18, sy);
  dayGain.gain.value = 0.5 * dayness;
  nightGain.gain.value = 0.4 * (1 - dayness);

  birdTimer -= dt;
  if (dayness > 0.3 && birdTimer <= 0) {
    chirp();
    birdTimer = (0.7 + Math.random() * 2.2) / Math.max(0.4, dayness);
  }
  cricketTimer -= dt;
  if (dayness < 0.5 && cricketTimer <= 0) {
    cricket();
    cricketTimer = 0.22 + Math.random() * 0.18;
  }
}
