# galley-ui

A small React design system for desktop admin tools, built on [Base UI](https://base-ui.com): design tokens (light + dark), headless-wrapped primitives, layout patterns, and Promise-based dialog hooks. Styled with CSS Modules and CSS custom properties — no runtime CSS-in-JS, no Tailwind.

It knows nothing about your domain: components speak in `tone`, `variant`, `status`, never in your business words.

## Install

```bash
pnpm add galley-ui
# peer dependencies
pnpm add react@^19 react-dom@^19
```

Requires Node ≥ 20 and React 19. The package ships ESM and CJS, TypeScript types, and one stylesheet.

## 30-second example

Import the stylesheet once (tokens + component styles), then compose.

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

## Confirm in one line

The part that sets galley-ui apart: dialogs you `await`.

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
            title: 'Delete this item?',
            description: 'This cannot be undone.',
            confirmLabel: 'Delete',
            tone: 'danger',
          });
          if (!ok) return;
          await onDelete();
        }}
      >
        Delete
      </Button>
      {element}
    </>
  );
}
```

- Every way of closing resolves — Cancel, Esc, backdrop click and the close button all resolve `false`. Nothing rejects, so no `try/catch`.
- `tone: 'danger'` paints the confirm button red and puts initial focus on **Cancel**; the default tone focuses **Confirm** (APG).
- Render `{element}` once. Calling `confirm()` while one is open resolves the previous promise with `false` first. Unmounting resolves pending promises with `false`.
- `useAlert()` is the one-button sibling (`await alert({ title })`, resolves `void`). Despite the name it is a plain `role="dialog"`, not an `alertdialog`: it does not interrupt screen readers, and Esc / backdrop click close it the same way. For errors that must interrupt, use a `danger` toast or `InlineAlert`.
- After a confirm resolves, showing progress for whatever async work follows is the caller's job (disable controls, `role="status"` text); the dialog itself has already closed.
- `useAwaitDialog<T>(cancelValue)` is the primitive underneath: you render any `Dialog` and call `resolve(value)`. Esc, backdrop click and the close button resolve with `cancelValue` here too. The render function runs during render — return a component if you need state; it is remounted on every open, so stale input never leaks between sessions. Closures are frozen at `open()` time: state that changes while the dialog is open is not reflected inside it.

## Dark mode

All colors are tokens. Switch by setting the attribute on `<html>`:

```html
<html data-theme="dark"></html>
```

Nothing else changes — spacing, type, radii and motion are shared. Persisting the choice is your app's job.

## Components

| Group                             | Exports                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **components** (hand-written)     | `Badge` · `Button` · `Card` · `EmptyState` · `InlineAlert` · `PageHeader` · `Separator` · `Skeleton` · `StatTile`                                                                     |
| **primitives** (Base UI wrappers) | `Checkbox` · `Dialog` · `Form` · `FormField` · `Input` · `Menu` · `Popover` · `RadioGroup` · `Select` · `Switch` · `Tabs` · `Textarea` · `ToastProvider` · `Tooltip`                  |
| **patterns** (layout)             | `AppShell` · `SidebarGroup` · `SidebarItem` · `TopBarChip` · `ListToolbar` / `ListToolbarTab` · `ListRow` / `ListRows` · `SplitPane` · `TimelineItem` / `TimelineItems` · `ActionBar` |
| **hooks**                         | `useConfirm` · `useAlert` · `useAwaitDialog` · `useToast`                                                                                                                             |

Every prop type is exported too (`ButtonProps`, `BadgeTone`, `SelectItem`, `MenuEntry`, `TimelineStatus`, …).

### Vocabulary

- `tone` is a **meaning, expressed as color**: `info | success | warning | danger` on `InlineAlert` and toasts, plus `neutral` on `Badge`; `default | muted | warning` on `StatTile`; `default | danger` on `useConfirm` / `useAlert`. Your app maps domain states to tones.
- `variant` is **shape or role**: `Button` `primary | secondary | ghost | danger`, `InlineAlert` `filled | plain`.
- `status` on `TimelineItem` is `pending | active | done | failed`.
- Accessible names are always passed as `aria-label` (`Select`, `Tabs`, `RadioGroup`, `ActionBar`, `ToastProvider`, …). `Checkbox` and `Switch` take a visible label as `children` (or `aria-label` when there is none).

### Labels are English by default

Built-in text defaults to English — Dialog close button `Close`, toast region `Notifications`, `useConfirm` `Confirm` / `Cancel`, `useAlert` `OK`. Localize at the call site:

```tsx
<Dialog closeLabel="닫기" … />
<ToastProvider aria-label="알림" closeLabel="닫기">…</ToastProvider>
confirm({ title, confirmLabel: '확인', cancelLabel: '취소', closeLabel: '닫기' })
```

## Design principles

- **Controlled only.** Inputs take `value` / `checked` plus `onValueChange` / `onCheckedChange` (`Input` and `Textarea` keep the native `onChange`); the component never owns form state. Two deliberate exceptions where the app has no reason to hold the state: `Popover` (`open` optional; if you pass `open` you must pass `onOpenChange`) and `TimelineItem` expansion (`defaultOpen`).
- **Thin wrappers.** Primitives keep Base UI's prop names (`onFormSubmit`, `errors`, `onOpenChange`). Behavior you might trip on is documented, not papered over.
- **Tokens, not literals.** Colors, spacing, type, radii, shadows, motion (`--ui-duration-*`, `--ui-ease`), focus ring (`--ui-focus-ring`), layers (`--ui-z-popup`, `--ui-z-toast`) and dimensions are `--ui-*` custom properties. Override them on `:root` to retheme.
- **CSS Modules.** Class names are scoped (`ui_<local>_<hash>`); every component merges a `className` you pass — onto its root, or onto the popup / trigger for floating primitives (`Dialog`, `Menu`, `Popover`, `Tooltip`, `Select`).
- **Domain-agnostic.** No business words in props, defaults or docs.
- **Client bundle.** The whole bundle carries a `"use client"` banner so it can be imported from React Server Components. Every export is therefore a client component — it still server-renders (SSR), it is just shipped to the client as well.
- **Dev warnings.** A `Checkbox`, `Switch` or `RadioGroup` with no accessible name outside a `FormField` logs a `console.warn` when your bundler defines `process.env.NODE_ENV` and it is not `'production'` (silent if `process` is undefined).

## Notes per component

**Form · FormField** — Put `required` on `FormField` only; the control inside inherits native `required`. Inside a plain `<form>` you get the browser's bubbles; inside `Form`, errors render inline under the field. `errors` keys are control `name`s — keep the object reference stable (state or a constant), an inline literal re-applies the error on every render and blocks submit. A field with a remaining error blocks submit; clear app-level `error` yourself, and pass post-submit errors through `errors`. Without `onFormSubmit`, `action` submits as usual (event details via native `onSubmit`). After the first submit, fields re-validate on change. `Switch` / `Checkbox` inside `FormField` take no `children` — the field label names them. The `Form<Values>` generic narrows the submit payload type only — nothing checks at runtime that the values match `Values`. The default vertical layout is written with `:where()` (specificity 0), so a `className` you pass (a grid, say) wins regardless of CSS load order.

**Popover** — Non-modal. `onOpenChange(false)` also fires on focus leaving. The `title` is not a heading.

**InlineAlert** — The live region is title + body; `action` sits outside it. `danger` / `warning` are `role="alert"` and are announced when rendered conditionally; `info` / `success` are `role="status"` and are not guaranteed to be announced when region and text appear together — mount a permanent region in the app if it matters. Use `info` for static notes and `variant="plain"` inside rows or already-boxed areas.

**Toast** — One `ToastProvider` at the app root. If you have a fixed top bar, set `--ui-toast-inset-top: calc(<bar height> + var(--ui-toast-inset))` on `:root`. Close buttons are hidden from assistive tech until the viewport expands (hover / focus); Esc and F6 are the keyboard path. `danger` / `warning` toasts are `alertdialog` and interrupt; they stay `aria-hidden` until focused, so role queries in tests need `hidden: true`. `useToast()` does not subscribe to the list, so callers never re-render; it is safe in a mount effect. It has not been verified whether a toast fired while a modal `Dialog` is open gets announced.

**Dialog** — `description` renders in a `<p>`; put block content (tables, lists) in `children`. `initialFocus` accepts a ref or `false`. `useConfirm` / `useAlert` expose `children` and `closeLabel` for the same reasons.

**Skeleton** — `radius` is `sm | md | lg | pill`. `width` / `height` take a number (px) or any CSS length.

**useAwaitDialog** — Opening from a _child's_ mount effect under React StrictMode (development) resolves the first promise with the cancel value, because StrictMode simulates an unmount before the parent's effect runs. Open from the owning component's effect or an event handler.

## Accessibility

Baseline for every component: keyboard operable, visible `:focus-visible` ring (token), accessible name via label or `aria-label`, text contrast ≥ 4.5:1 in both themes (dark values were chosen against a contrast table). Base UI supplies focus traps, roving tabindex and dismiss behavior; the wrappers add roles and names where Base UI 1.8 leaves them out (`Tooltip` popup, `role="tooltip"`).

Not yet verified: Windows forced-colors (high-contrast) mode — only `Separator` handles it; toggle state and selection rely on color and may need work. Screen-reader announcement of `Form` submit failures and of toasts over a modal are listed as follow-ups.

## Motion

Transitions and pulses use `--ui-duration-*` tokens. Under `prefers-reduced-motion: reduce` the tokens collapse to `0s` and pulses pause — no per-component media queries to maintain.

## Documentation site

A component catalog (Storybook or a static site) is planned. Until then the source of truth is this README, the exported TypeScript types (JSDoc on every prop) and the component gallery in the [Galley](https://github.com/HyungwonJang0327/galley) repository — run the dashboard locally and open `/design`.

## License

[MIT](https://github.com/HyungwonJang0327/galley/blob/main/packages/ui/LICENSE)
