# galley-ui

[English](https://github.com/HyungwonJang0327/galley/blob/main/packages/ui/README.md) · [한국어](https://github.com/HyungwonJang0327/galley/blob/main/packages/ui/README.ko.md) · **日本語**

デスクトップ向け管理ツールのための小さな React デザインシステムです。[Base UI](https://base-ui.com) の上に、デザイントークン（ライト + ダーク）、ヘッドレスをラップしたプリミティブ、レイアウトパターン、Promise で待てるダイアログフックを載せています。スタイルは CSS Modules と CSS カスタムプロパティのみ。ランタイム CSS-in-JS も Tailwind もありません。

ドメインを知りません。コンポーネントは `tone`、`variant`、`status` でだけ語り、あなたの業務用語は使いません。

## インストール

```bash
pnpm add galley-ui
# peer dependencies
pnpm add react@^19 react-dom@^19
```

Node 20 以上と React 19 が必要です。ESM と CJS、TypeScript の型、スタイルシート 1 つを同梱しています。

## 30 秒の例

スタイルシート（トークン + コンポーネントのスタイル）を一度 import して、組み合わせます。

```tsx
import 'galley-ui/styles.css';
import { AppShell, SidebarGroup, SidebarItem, PageHeader, Card, Button, Badge } from 'galley-ui';

export function App() {
  return (
    <AppShell
      topBar={<strong>My tool</strong>}
      sidebar={
        <SidebarGroup label="Work">
          <SidebarItem label="Inbox" href="/inbox" isActive badge={<Badge tone="info">3</Badge>} />
          <SidebarItem label="Archive" href="/archive" />
        </SidebarGroup>
      }
    >
      <PageHeader title="Inbox" actions={<Button>New item</Button>} />
      <Card>
        <Badge tone="success">Done</Badge> Everything is ready.
      </Card>
    </AppShell>
  );
}
```

## 確認ダイアログを 1 行で

galley-ui の特徴です。ダイアログを `await` します。

```tsx
import { Button, useConfirm } from 'galley-ui';

function DeleteButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const { confirm, element } = useConfirm();
  return (
    <>
      <Button
        variant="danger"
        onClick={async () => {
          const ok = await confirm({
            title: '削除しますか？',
            description: '元に戻せません。',
            confirmLabel: '削除',
            cancelLabel: 'キャンセル',
            closeLabel: '閉じる',
            tone: 'danger',
          });
          if (!ok) return;
          await onDelete();
        }}
      >
        削除
      </Button>
      {element}
    </>
  );
}
```

- どの閉じ方でも resolve します。キャンセル、Esc、背景クリック、閉じるボタン、すべて `false` で終わります。reject はないので `try/catch` も要りません。
- `tone: 'danger'` は確認ボタンを赤くし、初期フォーカスを**キャンセル**に置きます。既定の tone は**確認**にフォーカスします（APG）。
- `{element}` は一度だけレンダーします。開いたまま再び `confirm()` を呼ぶと、前の Promise が先に `false` で終わります。アンマウント時は待機中の Promise も `false` で終わります。
- `useAlert()` はボタン 1 つの兄弟です（`await alert({ title })`、`void` で resolve）。名前は alert ですが `role="dialog"` であり `alertdialog` ではありません。スクリーンリーダーに割り込まず、Esc と背景クリックでも同じように閉じます。割り込むべきエラーには `danger` トーストか `InlineAlert` を使ってください。
- 確認が resolve した後の非同期処理の進行表示は呼び出し側の役目です（コントロールの無効化、`role="status"` の文言）。ダイアログはすでに閉じています。
- `useAwaitDialog<T>(cancelValue)` はその下にあるプリミティブです。任意の `Dialog` を自分でレンダーし、`resolve(value)` を呼びます。Esc、背景クリック、閉じるボタンはここでも `cancelValue` で resolve します。レンダー関数はレンダー中に呼ばれるので、状態が必要ならコンポーネントを返してください。開くたびに再マウントされるので、前回の入力は残りません。クロージャは `open()` 時点で固定され、開いている間に変わった状態は中に反映されません。

## ダークモード

色はすべてトークンです。`<html>` の属性 1 つで切り替えます。

```html
<html data-theme="dark"></html>
```

それ以外は何も変わりません。間隔、タイポグラフィ、角丸、モーションは共有です。選択の保存はアプリの仕事です。

## コンポーネント

| グループ                           | export                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **components**（自作）             | `Badge` · `Button` · `Card` · `EmptyState` · `InlineAlert` · `PageHeader` · `Separator` · `Skeleton` · `StatTile`                                                                     |
| **primitives**（Base UI ラッパー） | `Checkbox` · `Dialog` · `Form` · `FormField` · `Input` · `Menu` · `Popover` · `RadioGroup` · `Select` · `Switch` · `Tabs` · `Textarea` · `ToastProvider` · `Tooltip`                  |
| **patterns**（レイアウト）         | `AppShell` · `SidebarGroup` · `SidebarItem` · `TopBarChip` · `ListToolbar` / `ListToolbarTab` · `ListRow` / `ListRows` · `SplitPane` · `TimelineItem` / `TimelineItems` · `ActionBar` |
| **hooks**                          | `useConfirm` · `useAlert` · `useAwaitDialog` · `useToast`                                                                                                                             |

props の型もすべて export されています（`ButtonProps`、`BadgeTone`、`SelectItem`、`MenuEntry`、`TimelineStatus`、…）。

### 語彙

- `tone` は**色で表した意味**です。`InlineAlert` とトーストは `info | success | warning | danger`、`Badge` はそれに `neutral` を加え、`StatTile` は `default | muted | warning`、`useConfirm` / `useAlert` は `default | danger`。ドメインの状態を tone に対応づけるのはアプリです。
- `variant` は**形または役割**です。`Button` は `primary | secondary | ghost | danger`、`InlineAlert` は `filled | plain`。
- `TimelineItem` の `status` は `pending | active | done | failed`。
- アクセシブルな名前は常に `aria-label` で渡します（`Select`、`Tabs`、`RadioGroup`、`ActionBar`、`ToastProvider`、…）。`Checkbox` と `Switch` は見えるラベルを `children` で受け取ります（ない場合は `aria-label`）。

### 既定のラベルは英語

組み込みの文言は英語が既定です。Dialog の閉じるボタン `Close`、トースト領域 `Notifications`、`useConfirm` の `Confirm` / `Cancel`、`useAlert` の `OK`。呼び出し側でローカライズしてください。

```tsx
<Dialog closeLabel="閉じる" … />
<ToastProvider aria-label="通知" closeLabel="閉じる">…</ToastProvider>
confirm({ title, confirmLabel: 'OK', cancelLabel: 'キャンセル', closeLabel: '閉じる' })
```

## 設計方針

- **制御コンポーネントのみ。** 入力は `value` / `checked` と `onValueChange` / `onCheckedChange` を受け取ります（`Input` と `Textarea` はネイティブの `onChange` のまま）。コンポーネントがフォームの状態を持つことはありません。アプリが状態を持つ理由のない 2 か所だけ例外です。`Popover`（`open` は任意、渡すなら `onOpenChange` が必須）と `TimelineItem` の展開（`defaultOpen`）。
- **薄いラッパー。** プリミティブは Base UI の prop 名をそのまま使います（`onFormSubmit`、`errors`、`onOpenChange`）。つまずきやすい挙動は隠さず、文書で伝えます。
- **リテラルではなくトークン。** 色、間隔、タイポグラフィ、角丸、影、モーション（`--ui-duration-*`、`--ui-ease`）、フォーカスリング（`--ui-focus-ring`）、レイヤー（`--ui-z-popup`、`--ui-z-toast`）、寸法が `--ui-*` カスタムプロパティです。`:root` で上書きしてテーマを変えます。
- **CSS Modules。** クラス名はスコープされます（`ui_<local>_<hash>`）。すべてのコンポーネントが渡された `className` をマージします。ルートに、あるいはフローティングなプリミティブ（`Dialog`、`Menu`、`Popover`、`Tooltip`、`Select`）では popup や trigger に。
- **ドメイン非依存。** props、既定値、文書に業務用語はありません。
- **クライアントバンドル。** バンドル全体に `"use client"` バナーが付いているので、React Server Components から import できます。したがってすべての export はクライアントコンポーネントです。サーバーレンダー（SSR）はそのまま行われ、クライアントにも送られるだけです。
- **開発時の警告。** `FormField` の外でアクセシブルな名前を持たない `Checkbox`、`Switch`、`RadioGroup` は、バンドラーが `process.env.NODE_ENV` を定義していてその値が `'production'` でないとき `console.warn` を出します（`process` が未定義なら沈黙）。

## コンポーネントごとの注意

**Form · FormField** — `required` は `FormField` にだけ書きます。内側のコントロールがネイティブの `required` を継承します。素の `<form>` の中ではブラウザの吹き出しが出て、`Form` の中でだけエラーがフィールドの下にインラインで出ます。`errors` のキーはコントロールの `name` です。オブジェクトの参照を安定させてください（state か定数）。インラインリテラルだとレンダーごとにエラーが再適用され、送信が止まります。エラーが残るフィールドは送信を止めます。アプリ側の `error` はアプリが消し、送信後に決まるエラーは `errors` で渡します。`onFormSubmit` がなければ `action` が通常どおり送信します（イベント情報はネイティブの `onSubmit`）。初回送信の後は change ごとに再検証します。`FormField` の中の `Switch` / `Checkbox` は `children` を受け取りません。フィールドのラベルが名前になります。`Form<Values>` のジェネリクスは送信値の型を狭めるだけです。値が `Values` に合うかは実行時に検査しません。既定の縦並びは `:where()`（詳細度 0）で書かれているので、渡した `className`（grid など）が CSS の読み込み順に関係なく勝ちます。

**Popover** — 非モーダルです。`onOpenChange(false)` はフォーカスが離れたときにも来ます。`title` は heading ではありません。

**InlineAlert** — live 領域はタイトル + 本文です。`action` はその外にあります。`danger` / `warning` は `role="alert"` なので、条件付きでレンダーされると読み上げられます。`info` / `success` は `role="status"` で、領域と文言が同時に現れた場合に読み上げられる保証はありません。重要なら、アプリに常設の領域をマウントしてください。静的な案内には `info` を、行の中やすでに枠のある場所には `variant="plain"` を使います。

**Toast** — `ToastProvider` はアプリのルートに 1 つ。固定の上部バーがあるなら `:root` に `--ui-toast-inset-top: calc(<バーの高さ> + var(--ui-toast-inset))` を置きます。閉じるボタンはビューポートが展開する（hover / focus）まで支援技術から隠されます。キーボードの経路は Esc と F6 です。`danger` / `warning` のトーストは `alertdialog` として割り込んで読み上げられ、フォーカスされるまで `aria-hidden` なので、テストで role から探すには `hidden: true` が必要です。`useToast()` はリストを購読しないので、呼び出し側は再レンダーされません。マウント時の effect で使っても安全です。モーダルの `Dialog` が開いている間に出したトーストが読み上げられるかは検証していません。

**Dialog** — `description` は `<p>` の中に描かれます。表やリストなどのブロックは `children` に入れてください。`initialFocus` は ref か `false` を受け取ります。同じ理由で `useConfirm` / `useAlert` も `children` と `closeLabel` を公開しています。

**Skeleton** — `radius` は `sm | md | lg | pill`。`width` / `height` は数値（px）か任意の CSS 長さ。

**useAwaitDialog** — React StrictMode（開発時）で*子*のマウント effect から開くと、最初の Promise が cancel 値で終わります。StrictMode が親の effect より前にアンマウントをシミュレートするためです。所有するコンポーネントの effect かイベントハンドラから開いてください。

## アクセシビリティ

すべてのコンポーネントの基準線: キーボードで操作できる、見える `:focus-visible` リング（トークン）、ラベルか `aria-label` によるアクセシブルな名前、両テーマで文字コントラスト 4.5:1 以上（ダークの値はコントラスト表で選びました）。フォーカストラップ、roving tabindex、dismiss の挙動は Base UI が提供し、Base UI 1.8 が省いている role と名前はラッパーが補います（`Tooltip` popup の `role="tooltip"`）。

未検証: Windows の forced-colors（ハイコントラスト）モードは `Separator` のみ対応しています。トグルの状態と選択の表示が色に依存しているため、手直しが必要かもしれません。`Form` 送信失敗とモーダル上のトーストのスクリーンリーダー読み上げは今後の課題です。

## モーション

トランジションとパルスは `--ui-duration-*` トークンを使います。`prefers-reduced-motion: reduce` ではトークンが `0s` になり、パルスが止まります。コンポーネントごとのメディアクエリを管理する必要はありません。

## ドキュメントサイト

コンポーネントカタログ（Storybook または静的サイト）を予定しています。それまでは、この README、export された TypeScript の型（すべての prop に JSDoc）、そして [Galley](https://github.com/HyungwonJang0327/galley) リポジトリのコンポーネントギャラリーが基準です。ダッシュボードをローカルで起動して `/design` を開いてください。

## ライセンス

[MIT](https://github.com/HyungwonJang0327/galley/blob/main/packages/ui/LICENSE)
