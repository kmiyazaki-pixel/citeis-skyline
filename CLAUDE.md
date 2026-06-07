# CLAUDE.md

このファイルは Claude (Claude Code 含む) に向けたプロジェクト引き継ぎ書です。
新しいセッションを始めるときは、まずこのファイルを読んでください。

---

## プロジェクト概要

Cities Skylines を参考にした、グリッド型街づくりシミュレーションの
**個人プログラミング練習プロジェクト**。

- HTML / CSS / JS のみ、ES Modules
- ビルドツールなし (素のブラウザで `<script type="module">` で動く)
- GitHub → Vercel で自動デプロイ
- ワールド描画は **Three.js (CDN ESM, WebGL) で 3D**、UI は DOM
- Three.js は importmap 経由で `unpkg.com/three@0.160.0` から読み込み (ビルドツール不要)
- 個人練習のため、Cities Skylines の素材・コード・固有名詞は一切コピーしない

## ユーザー情報

- 日本語でやりとり
- JS/HTML は理解している
- React/Next.js などのフレームワークは未経験
- 過去に同じ方針で `slime-clone` (スライム伝説風オートバトル) を作成済み
- スマホでの確認も多いので、タッチ操作対応は維持

## 重要な制約 (絶対に守る)

1. **グラフィックは Three.js のメッシュ (BoxGeometry など) or CSS図形のみ** — 画像ファイル
   (.png/.jpg/.svg) もテクスチャも使わない。形状と色だけで表現する
2. **既存ゲームの素材・コード・固有名詞をコピーしない** — Cities Skylines の
   建物名、UI、特定の表現を真似しない。仕組みだけを参考にする
3. **ビルドツールを導入しない** — Vite/Webpack/Next.js などは使わず、
   素のブラウザで動く構成を維持。Three.js は importmap で CDN から取る
4. **ファイル分割の方針を維持** — 1ファイル1責務。
   状態は `state.js`、定数は `config.js`、DOM参照は `dom.js` に集約

## 現在のステータス

- [x] **Phase 1**: グリッド + 道路/住宅/取壊 + 基本経済シミュ
- [x] **3D 化**: 描画を Canvas 2D → Three.js (WebGL) に移植 ← **ここ完了**
- [ ] **Phase 2**: 商業ゾーン + 雇用システム ← **次はここから**
- [ ] **Phase 3**: 公共サービス (電気・水道)
- [ ] **Phase 4**: 渋滞シミュ・公共交通
- [ ] **Phase 5**: 区画と税率設定、セーブ機能

## ファイル構成

```
.
├── index.html          HTML骨格
├── styles/
│   ├── base.css        リセット、CSS変数、全体レイアウト
│   ├── world.css       キャンバス/ワールド表示
│   └── ui.css          ステータスバー、ツールバー
└── src/
    ├── main.js         エントリ。入力処理 + ゲームループ
    ├── config.js       チューニング用の定数
    ├── state.js        ゲーム状態
    ├── dom.js          DOM参照を集約
    ├── utils.js        formatCash, neighbors4, mixHex
    ├── grid.js         タイル取得・設置・道路接続判定
    ├── renderer.js     Three.js シーン構築・タイル差分更新・raycast
    ├── tools.js        ツール選択
    ├── simulation.js   人口成長・税収の計算
    └── ui.js           ステータスバー更新
```

## 設計上のお約束

- **`config.js` vs `state.js`**: 実行中に変わらない値は `config`、変わる値は `state`
- **Canvas は1つだけ**: ワールド描画は単一の WebGL `<canvas>` (Three.js)。UI は DOM。
  オーバーレイも複数キャンバスを増やさず、HUD は DOM、3Dオーバーレイは同じシーンに足す
- **Three.js は `renderer.js` に閉じ込める**: 他のファイルから `THREE` も `scene` も
  直接触らない。新しいタイル種を足すときは `renderer.js` にメッシュ生成関数を追加し、
  `updateTiles()` の差分更新ロジックに条件を追加する形にする
- **タイルメッシュは差分更新**: タイプが変わったらメッシュ作り直し、値だけの変化
  (人口など) は `scale`/`material.color` を直接いじる。毎フレーム作り直さない
- **座標系**: グリッド `(x, y)` → ワールド `(x + 0.5, height/2, y + 0.5)`。
  Three.js の世界では Y が上、X-Z が地面平面。`y` が地面上の縦、ではなく Z 軸方向
- **ゲームループ**: `requestAnimationFrame` で毎フレーム描画。
  シミュレーションは `TICK_INTERVAL` (デフォ500ms) ごとに 1tick
- **タイル定義**: `grid[y][x] = { type, population, ... }`。
  新しいプロパティを追加する時は `state.js` の `makeEmptyGrid` も更新
- **隣接判定**: `utils.neighbors4` を使う (上下左右)。
  Phase 4 で 8方向が必要になったら `neighbors8` を追加

## 次にやること: Phase 2 (商業ゾーン + 雇用)

### 仕様

- **商業 (commercial)** タイルを追加 (例: $80, 青系の色)
- 各住宅タイルは「働く場所」が必要 → 商業タイルが提供する「雇用枠」を消費
- 雇用が満たされている住宅だけが成長する (なければ衰退)
- 商業タイルも道路接続が必要
- 商業タイルは「客」を必要とする → 周辺に住民がいれば収益を生む
- 税収式の改修: 住宅税 + 商業税

### 実装プラン

1. **`config.js`** に追加:
   ```js
   COST: { ..., commercial: 80 },
   COMMERCIAL: {
     JOBS_PER_TILE: 6,        // 1タイルが提供する雇用枠
     INCOME_PER_CUSTOMER: 0.1, // 1顧客あたりの税収
     CUSTOMER_RANGE: 3,        // 顧客を集める範囲 (マンハッタン距離)
   }
   ```

2. **`state.js`** の `grid` のタイル定義に追加:
   ```js
   { type, population, employed, customers }
   ```

3. **`index.html`** に商業タイルのツールボタン追加 + アイコンCSS

4. **`grid.js`**: 雇用機会の集計関数 `getTotalJobs()` を追加

5. **`simulation.js`** を改修:
   - 全商業タイルの雇用枠合計 = 都市全体の雇用容量
   - 全住宅タイルの人口合計 ≤ 雇用容量 ならフル成長、超えるとプロラタで制限
   - 商業タイルは半径内の住民数 = 顧客数として収益化

6. **`renderer.js`** に commercial 用メッシュ生成関数を追加 (青系の Box、occupancy で
   色濃淡と高さ補間)。`updateTiles()` の差分更新ロジックにも分岐を追加

### UX注意点

- 雇用が満たされない住宅は色を少しグレーアウト or "?" 表示で視覚化
- 「足りてない」状態がプレイヤーに伝わるフィードバックを必ず入れる
  (Phase 3以降で需要バーや警告アイコンを追加する伏線)

## ローカル開発

```bash
python3 -m http.server 8000
# または: npx serve
```

ブラウザで http://localhost:8000

## デプロイ

GitHub に push → Vercel が自動で再デプロイ。設定不要。

---

## 開発時のお願い (Claude へ)

- 大きい変更を入れる前に、なぜそうするのかを一言説明してください
- 「Phase X 進めて」と言われたら、上記の実装プランに沿って進めてください
- ファイル分割の境界を勝手に変えないでください (議論してから変更)
- バランス調整 (コスト、税率など) は `config.js` の数値だけで完結させてください
- 描画コードは `renderer.js` に集約。他のファイルから `THREE` や `scene` を直接触らない
- レスポンスは日本語で、簡潔に
