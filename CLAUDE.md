# CLAUDE.md

このファイルは Claude (Claude Code 含む) に向けたプロジェクト引き継ぎ書です。
新しいセッションを始めるときは、まずこのファイルを読んでください。

---

## プロジェクト概要

**こもれび平原 (Komorebi Plains)** — ブラウザで遊べる 3D オープンワールド探索ゲーム。
プロシージャル生成の無限地形を歩き回り、クリスタルを集める。
(旧: Cities Skylines 風街づくりシミュ。ユーザーの指示で全面的に作り変えた)

- HTML / CSS / JS のみ、ES Modules
- ビルドツールなし (素のブラウザで `<script type="module">` で動く)
- GitHub → Vercel で自動デプロイ
- 描画は **Three.js (CDN ESM, WebGL)**。importmap 経由で `unpkg.com/three@0.160.0`
- 効果音は WebAudio のオシレーター合成 (音源ファイルなし)

## ユーザー情報

- 日本語でやりとり
- JS/HTML は理解している
- React/Next.js などのフレームワークは未経験
- スマホでの確認も多いので、タッチ操作対応は維持

## 重要な制約 (絶対に守る)

1. **アセットファイルを使わない** — 画像 (.png/.jpg/.svg)・テクスチャ・3Dモデル・
   音源ファイルは一切使わない。形状は Three.js プリミティブ、音は WebAudio 合成
2. **既存ゲームの素材・コード・固有名詞をコピーしない** — 仕組みだけを参考にする
3. **ビルドツールを導入しない** — Vite/Webpack などは使わず、素のブラウザで動く構成を維持
4. **ファイル分割の方針を維持** — 1ファイル1責務 (下記参照)

## 遊び方 (操作)

- **PC**: WASD/矢印キー移動、マウスドラッグ or ポインターロックで視点、
  Space ジャンプ、Shift ダッシュ
- **スマホ**: 左下の仮想ジョイスティックで移動 (強く倒すとダッシュ)、
  画面ドラッグで視点、右下ボタンでジャンプ

## ファイル構成

```
.
├── index.html          HTML骨格 (HUD、タイトル画面、ジョイスティック、favicon/manifest)
├── manifest.webmanifest PWA マニフェスト (アイコンは emoji の SVG data-URI)
├── sw.js               Service Worker (network-first、オフライン対応)
├── styles/
│   ├── base.css        リセット、全画面キャンバス
│   └── ui.css          HUD、タイトル画面、タッチUI、「+1」ポップ
└── src/
    ├── main.js         エントリ。ゲームループ (rAF+setTimeout 先勝ち) とエラートースト
    ├── config.js       チューニング用の定数 (地形・プレイヤー・昼夜・密度・手触り)
    ├── state.js        ゲーム状態 (player / input / timeOfDay / crystals)
    ├── engine.js       Three.js renderer/scene/camera/lights + EffectComposer(Bloom)
    ├── noise.js        決定的ハッシュ + value noise + fBm (依存なし)
    ├── world.js        チャンク式地形生成、heightAt、木/岩/花/クリスタル、水面、風揺れ
    ├── player.js       三人称キャラ操作、カメラ(遅延追従/FOV/着地)、人型アバター
    ├── input.js        キーボード/マウス/タッチ → state.input
    ├── sky.js          昼夜サイクル (太陽/月/星/空色/霧/ライト)
    ├── creatures.js    野ウサギ (徘徊 + 逃走)
    ├── audio.js        WebAudio 合成 (効果音・足音・昼夜の環境音)
    └── hud.js          HUD表示、タイトル画面、クリスタル「+1」ポップ
```

## 設計上のお約束

- **`config.js` vs `state.js`**: 実行中に変わらない値は `config`、変わる値は `state`
- **`world.heightAt(x, z)` が地形の唯一の真実**: 描画メッシュも接地判定も
  同じ式から計算する。地形を変えるときはこの関数だけを変える
- **Three.js のセットアップは `engine.js`**: renderer/scene/camera/lights は
  engine が生成し `export let` で公開。他モジュールは import して使う
  (`setupEngine()` 後でないと null なので、モジュールトップで使わないこと)
- **チャンクのライフサイクル**: プレイヤー周囲 `VIEW_RADIUS` に生成、
  `VIEW_RADIUS+1` を超えたら破棄。1フレームの生成数は
  `MAX_CHUNK_BUILDS_PER_FRAME` で律速。地形ジオメトリは破棄時に dispose、
  共有ジオメトリ (GEO) と共有マテリアル (MAT) は dispose しない
- **風景は チャンクごとの InstancedMesh**: 木 (幹+葉)/岩/花。
  `frustumCulled = false` (インスタンスが散らばるため)。
  配置は `hash2` による決定的乱数 (同じチャンクは何度生成しても同じ)
- **クリスタルは個別メッシュ**: 回転アニメと取得削除があるため。
  取得済みは `collectedCrystals` Set (key: "cx,cz,i") で永続管理
- **入力は `state.input` 経由**: input.js が書き、player.js が消費する。
  視点 delta (lookDX/DY) は消費式 (player が読んだら 0 に戻す)
- **ゲームループは rAF + setTimeout の先勝ち**: visibility 切替で
  rAF 待ちのまま永久停止する事故を防ぐ (過去に実際に起きたバグ)
- **`window.__game = { state }`**: 開発用フック。preview からの動作検証に
  使うので削除しないこと
- **エラートースト**: 未捕捉エラーは画面下に表示される (#errToast)。
  スマホでのデバッグ用。削除しないこと
- **モバイル軽量化**: `engine.isMobile` で影を無効化、antialias off

## 現在のステータス

- [x] **v1 (旧)**: 街づくりシミュ Phase 1〜1.75 (git 履歴参照)
- [x] **v2**: オープンワールド化 — 地形/プレイヤー/昼夜/クリスタル/ウサギ
- [x] **Tier 1**: 市販寄せの磨き込み (制約維持) ← **ここ完了**
  - ACES トーンマップ + MeshStandard + Bloom、木葉/草の風揺れ
  - ゲームフィール (カメラ遅延追従・ダッシュFOV・着地dip・クリスタル吸寄せ・「+1」ポップ)
  - 環境音 (風/昼の鳥/夜の虫) + 地形別足音・着地・水しぶき
  - タイトル背景のワールド旋回、emoji favicon、PWA(manifest+SW)、reduced-motion対応
- [x] **Tier 2**: 本物のゲーム化 ← **ここ完了**
  - セーブ (localStorage, つづきから) + 進行ループ (5/15/30個で 2段ジャンプ/グライド/泳ぎ)
  - 一時停止 + 設定画面 (音量4種・感度・上下反転・影)
  - プロシージャル BGM (昼夜で変わる pad+pluck、SFXダッキング)
  - 目標トラッカー (最寄りクリスタルへの矢印)、スタミナ、光の柱ランドマーク
  - 水面の頂点波、遠景の山リング
  - 留保: 祠クエストの連鎖、岸の泡 (次パス)
- [ ] **Tier 3**: 出荷 (衝突判定、v1.0スコープ確定、itch.io→Steam、コンテンツ量)
- 個別の積み残し: 木/岩の衝突判定、バイオーム、祠クエスト

## ローカル開発

```bash
npx serve -l 8000 .
# または python3 -m http.server 8000
```

ブラウザで http://localhost:8000

## デプロイ

GitHub に push → Vercel が自動で再デプロイ。設定不要。

---

## 開発時のお願い (Claude へ)

- 大きい変更を入れる前に、なぜそうするのかを一言説明してください
- バランス調整 (速度、密度、時間など) は `config.js` の数値だけで完結させてください
- ファイル分割の境界を勝手に変えないでください (議論してから変更)
- レスポンスは日本語で、簡潔に
