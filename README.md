# シティ自作

Cities Skylines を参考にした、グリッド型街づくりシミュの個人練習プロジェクト。

## ローカルで動かす

ES Modules を使っているので簡易サーバーが必要:

```bash
python3 -m http.server 8000
# または: npx serve
```

→ `http://localhost:8000`

## ファイル構成

```
.
├── index.html          HTML骨格 (CSS/JS を読み込む)
├── styles/
│   ├── base.css        リセット、CSS変数、全体レイアウト
│   ├── world.css       キャンバス/ワールド表示
│   └── ui.css          ステータスバー、ツールバー
└── src/
    ├── main.js         エントリ。入力処理 + ゲームループ
    ├── config.js       チューニング用の定数
    ├── state.js        ゲーム状態 (cash, population, grid, selectedTool)
    ├── dom.js          DOM参照を集約
    ├── utils.js        formatCash, neighbors4, mixHex
    ├── grid.js         タイルの取得・設置・道路接続判定
    ├── renderer.js     Canvas描画
    ├── tools.js        ツール選択 (道路/住宅/取壊)
    ├── simulation.js   人口成長・税収の計算
    └── ui.js           ステータスバー更新
```

## どこを触ればいい？

| やりたいこと | 触るファイル |
|---|---|
| バランス調整 (コスト、成長速度、税率) | `src/config.js` |
| 新しいタイル種類を追加 (商業/工業など) | `src/state.js` + `grid.js` + `renderer.js` + `simulation.js` |
| 描画スタイルを変える | `src/renderer.js` + CSS変数 |
| 新しいツールを追加 | `index.html` (ボタン) + `src/tools.js` |
| シミュレーションロジック | `src/simulation.js` |

## ゲーム仕様 (Phase 1)

- 24×24 のグリッド
- 道路 ($20), 住宅 ($50), 取り壊し (無料) の3ツール
- 開始所持金: $10,000
- 住宅は **道路に隣接** していると人口が増える (最大4人/タイル)
- 道路が無い住宅は徐々に衰退
- 人口 × 0.04 を毎tick (0.5秒) 税収として獲得
- ドラッグで連続設置可能
- スマホのタッチ操作対応

## Phase ロードマップ

- [x] **Phase 1**: グリッド + 道路/住宅/取壊 + 基本経済シミュ
- [ ] **Phase 2**: 商業ゾーン + 雇用システム (住民が職場を必要とする)
- [ ] **Phase 3**: 公共サービス (電気・水道)
- [ ] **Phase 4**: 渋滞シミュ・公共交通
- [ ] **Phase 5**: 区画 (district) と税率設定、セーブ機能

## デプロイ

GitHub に push → Vercel が自動で再デプロイ。
