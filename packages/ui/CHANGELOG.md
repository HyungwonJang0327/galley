# galley-ui

## 0.2.1

### Patch Changes

- 02b4942: README: link to the Storybook site (https://hyungwonjang0327.github.io/galley/) — every component in every state, light/dark, props tables, a11y panel. Story samples no longer use domain words.

## 0.2.0

### Minor Changes

- 5fe8d11: Add `Avatar` (`name`, `src`, `size: sm | md | lg`) with initials fallback and `--ui-avatar-size-*` tokens. Exports `initialsOf(name)`.
- 3e95964: Add `Breadcrumb` (`items` with optional `render` link elements, last item `aria-current="page"`) and an `eyebrow` slot on `PageHeader` for it.
- c6780dd: Add `--ui-font-mono` token (monospace stack: `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`) for code, paths and hashes. Apps no longer need to hardcode a monospace stack.

## 0.1.0

### Minor Changes

- 39df4f8: Initial public release: light/dark design tokens, 35 components (9 hand-written, 14 Base UI primitives, 12 layout patterns) and 4 hooks (`useConfirm`, `useAlert`, `useAwaitDialog`, `useToast`).
