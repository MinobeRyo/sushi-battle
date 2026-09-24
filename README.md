# 寿司デッキバトル

回転寿司レーンでデッキを構築し、相手のお腹を満タンにさせて勝つカードゲーム風Webアプリ。

---

## ゲーム概要

**2フェーズ構成**

1. **ドラフトフェーズ** — 回転レーンから流れてくる皿を軍資金（初期¥3,000）で購入し、最大20枚のデッキを組む
2. **バトルフェーズ** — 構築したデッキで相手のお腹ゲージを0→100にしたら勝ち

### 用語

| 用語 | 意味 |
|------|------|
| 軍資金 | ドラフトで皿を買うお金 |
| 食欲ポイント | バトルでカードを出すコスト（マナ相当） |
| お腹ゲージ | 満タン（100）になったら負け |
| 机 | バトルの場。持続型カードを最大8枚並べる |

---

## ドラフトフェーズ — レーン構成

| レーン | 仕組み |
|--------|--------|
| 汎用・サイドメニュー | ベルトで循環。たまご・サーモン系の汎用カード |
| ビルド系雑多 | ベルトで循環。各アーキタイプ・特殊効果・高級カード混在 |
| 新幹線ゾーン | 全3回まで。好きなカードを定価×1.5で即注文 → 皿が右から飛んでくる |

- 購入した皿の位置は穴（ダッシュ円）になりベルトは止まらない
- 皿をタップすると購入モーダルが開き、皿が画面外に流れたら自動で閉じる

---

## カードデータ

**アーキタイプ 7種**（ビルド5種 ＋ 汎用 ＋ 軍艦）

| アーキタイプ | 枚数 | 代表例 | 戦略 |
|-------------|-----:|--------|------|
| 赤身 (akami) | 9 | マグロ・大トロ | 高火力バースト |
| 巻物 (makimono) | 19 | かっぱ巻き・納豆巻き | 机に並べて維持する |
| 軍艦 (gunkan) | 10 | うに軍艦・カニ軍艦 | 巻物コンプ②で攻撃×1.5を受けるフィニッシャー |
| 光り物 (hikari) | 9 | サバ・アジ・コハダ | 切れ味スタックビルド |
| 海鮮 (kaisen) | 8 | たこ・いか・えび | 連鎖攻撃と再攻撃 |
| 肉寿司 (niku) | 8 | 和牛・カルビ | 相手のお腹が多いほど強い |
| 汎用 (general) | 10 | たまご・サーモン | どのビルドにも入る |

複数タグを持つカードがあるので合計は54枚を超えます。うに軍艦は海鮮ではなく巻物・軍艦です。

**カードタイプ 2種**

- **即時型** — 出したターンに攻撃して捨て札へ
- **持続型** — 机に残り毎ターン継続ダメージ（満腹度=持続ターン数）

---

## 技術スタック

```
React 19 + TypeScript + Vite 8
Tailwind CSS v4 (@tailwindcss/vite)
Framer Motion 12
Three.js 0.184 + @react-three/fiber 9 + @react-three/drei 10
Pixi.js 7.4 (未使用。参照元の DraftScreenPixi ごと削除予定)
Zustand 5 (未使用。バトル画面は useRef + useReducer で実装した)
```

---

## ディレクトリ構成

```
src/
├── App.tsx                          # フェーズ管理（タイトル→モード選択→ドラフト→バトル）
├── types/index.ts                   # 型定義（Card, Archetype, Lane ほか）
├── components/
│   └── SushiArt.tsx                 # 皿の上の寿司の2D描画
├── data/
│   └── cards.ts                     # カードマスターデータ（54枚）
└── features/
    ├── title/
    │   ├── TitleScreen.tsx
    │   └── ModeSelectScreen.tsx
    ├── draft/
    │   ├── DraftScreenThree.tsx     # ドラフトの購入・タイマー・画面構成
    │   ├── StaffHelpModal.tsx       # 店員さんの解説
    │   ├── scene/                  # レーン・特急の移動と3Dシーン
    │   ├── models/                 # 寿司の形状・素材・テクスチャ
    │   ├── PurchaseModal.tsx        # 皿購入モーダル
    │   ├── ShinkansenOrderModal.tsx # 特急注文UI（iPad風）
    │   ├── DraftScreen.tsx          # ※未使用（CSS版の旧実装）
    │   ├── DraftScreen3D.tsx        # ※未使用
    │   ├── DraftScreenPixi.tsx      # ※未使用
    │   ├── ConveyorLane.tsx         # ※未使用（CSS版のベルト）
    │   ├── SushiPlate.tsx           # ※未使用
    │   ├── ShinkansenLane.tsx       # ※未使用
    │   └── PixiConveyorBelt.tsx     # ※未使用
    └── battle/
        ├── BattleScreen.tsx         # バトル画面のレイアウトと演出
        ├── useBattleGame.ts         # 召喚・ターン交代・追加注文の進行管理
        ├── battleEngine.ts          # カード効果・ダメージ・コンボ・CPU・初期状態
        ├── BattleCards.tsx          # 手札・机のカードと詳細表示
        ├── BattleStatus.tsx         # お腹ゲージ・コンボ進捗
        ├── battlePresentation.ts    # 色・サイズ・効果説明
        └── types.ts                 # バトルの状態・画面用の型

scripts/
├── test-battle-logic.mjs            # バトルロジックの回帰テスト（68件）
└── gen-datasheet.mjs                # カード一覧HTMLの生成

docs/
├── すしバトル_データシート.html      # 全カードとコンボの一覧（生成物）
├── すしバトル_改修提案.html          # 改修提案と対応状況
└── 資料と実装のズレ.html             # 資料同期の作業リスト
```

※印のファイルはレーン画面を3D版に一本化した時点で参照されなくなりました。削除待ちです。

### 変更箇所の目安

- ルールやCPUのカード選択を変える: `battleEngine.ts`
- 召喚から攻撃、次の手番への進み方を変える: `useBattleGame.ts`
- バトルの見た目を変える: `BattleScreen.tsx` / `BattleCards.tsx` / `BattleStatus.tsx`
- 寿司の造形を変える: `draft/models/`、皿の動かし方を変える: `draft/scene/`
- 店員の説明を更新する: `StaffHelpModal.tsx`

回帰テストは画面ソースの切り出しをせず、`battleEngine.ts` と実際の依存モジュールをメモリ内で読み込みます。`npm test` でも実行できます。

---

## ドラフト画面の実装詳細

レーン画面は Three.js 版に一本化しています。ドラフトも、バトル中の追加注文タイムも同じ画面です。

### DraftScreenThree

- **`useFrame` でベルト制御**: CSSアニメーションの代わりにrefで位置を管理して毎フレーム更新
- **皿**: `CylinderGeometry` + `meshStandardMaterial`、ホバーで浮き上がり
- **ライティング**: AmbientLight + DirectionalLight（シャドウ付き）+ PointLight×3（暖色・店内照明）
- **フォグ**: `<fog>` で奥行き感を演出
- **タブレットUI**: HTML overlayとしてCanvasの上に絶対配置
- **二人対戦**: `playerNum` でP1/P2バッジを出す。追加注文タイムでは `initialBudget` と `seconds` を差し替える

### タブレット端末（カウンター上）

実際のスシロー店舗のiPadオーダー端末を参考に設計。カウンターの茶色い木目エリアの上部中央にスタンド付きで配置。

- 注文可能時: 赤ヘッダー + カテゴリグリッド + 残り回数ドット
- 使い切り時: 「本日終了」表示でグレーアウト

---

## バトルフェーズ

- **勝敗**: お腹ゲージが100に到達した側の負け
- **AP（食欲ポイント）**: 初期2、上限10。CPU戦は毎ターン+1、二人対戦は2ターンで+1
- **消化**: ターン終了時にお腹が減る。`min(5, 1+ラウンド)`
- **机**: 最大8枚。持続型は `max(満腹度, 2)` ターン残って毎ターン攻撃する
- **手札**: 上限7枚。引けない分は山札に残る
- **追加注文タイム**: 両者の手札と山札が尽きたら発生。¥1,500 / 45秒で補充する
- **コンボ**: 6役。発動の仕方は「永続効果（1試合1回）」「都度発動」「状態継続」の3種類

詳しくは `docs/すしバトル_データシート.html`（`node scripts/gen-datasheet.mjs` で再生成）を参照。

---

## 今後の実装予定

- [x] バトル画面
- [x] コンボエンジン
- [x] CPU対戦ロジック（簡易。攻撃力の高い順に出すだけなので改善余地あり）
- [ ] 未使用ファイルの削除と pixi.js の依存除去
- [ ] 自動対戦シミュレーションによるバランス検証
- [ ] 薬味スロット / サイドメニュー
- [ ] 寿司3Dモデル（GLTFアセット）の読み込み
- [ ] Supabaseによるオンライン対戦（v2）

---

## 起動方法

```bash
npm install
npm run dev
# → http://localhost:5173/
```

## 開発中に流すもの

```bash
node scripts/test-battle-logic.mjs        # バトルロジックの回帰テスト
node scripts/gen-datasheet.mjs            # カード一覧HTMLの再生成
npx tsc --noEmit -p tsconfig.app.json     # 型チェック
```
