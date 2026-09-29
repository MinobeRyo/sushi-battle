# サイドメニューの3D図鑑

唐揚げ・ポテト・天ぷら盛り合わせ・ラーメン・あおさの味噌汁・茶碗蒸しの6種を表示します。
このフォルダはモデルと図鑑表示のみで、購入やバトルの判定は変更しません。

## 図鑑から開く

```tsx
const SideMenuStudio = lazy(() => import('../side-menu/SideMenuStudio'))

// 親の図鑑で表示を切り替え、既存の検索状態を保持します。
if (showSideMenus) {
  return (
    <Suspense fallback={<p role="status">サイドメニューを準備しています…</p>}>
      <SideMenuStudio onBack={() => setShowSideMenus(false)} />
    </Suspense>
  )
}
```

- エントリー: `SideMenuStudio.tsx` の default export。
- `onBack` を指定すると、左上のロゴと右上の戻る操作がこの関数を呼びます。ページ再読み込みは行いません。
- `onBack` なしでも従来の単独プレビューとして表示でき、タイトルへ戻ります。
- 親要素に高さを与えてください。画面内は `height: 100%; overflow: auto` でスクロールします。
- 自前の `Canvas` を持つDOM画面なので、既存 `Canvas` の中へは配置しません。
- 一覧・一皿表示、回転・拡大、自動回転、料理切替、効果紹介に対応しています。
- 外部画像・外部通信・新規パッケージは不要です。

## モデルだけ使う

既存のThree.jsシーンへ追加する場合は、器を含む `SideMenuModel` を使えます。

```tsx
import { SideMenuModel } from '../side-menu/models/SideMenuModel'

<SideMenuModel id="ramen" />
```

IDは `karaage` / `fries` / `tempura` / `ramen` / `miso` / `chawanmushi`。
各モデルは原点中心、底面はおおむね y=0、幅は約2.2以下です。
あおさはユーザーの指摘を反映し、丸みのある薄片14枚へ修正済みです。

## 効果紹介の取り扱い

`sideMenuCatalog.ts` は会話で決めた設計案の表示用データです。
サイドメニューは1試合に1個購入・専用スロット1枠を想定しています。
ラーメン以外の継続型の持続期間や価格は未確定のため、数値を追加していません。

## 連携範囲

- サイドメニュー担当: このフォルダのモデル・ギャラリー。
- 寿司モデルと図鑑担当: `CardCatalogScreen.tsx/css` への切替導線と統合確認。
- 先行して公開準備中のマルチ画面・図鑑変更は保持します。
- 受け渡しコミットには `App.tsx` の単独プレビュー入口や他担当の変更を含めません。
