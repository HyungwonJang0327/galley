# galley-ui

## 0.4.0

### Minor Changes

- 15f5aeb: `Button`: default `md` height is now 32px (same as form controls, `--ui-control-height`) so a button next to an `Input`/`Select` lines up by default. New `size="lg"` (36px, `--ui-button-height-lg`) for standalone primary calls to action. `sm` (28px) is unchanged.

### Patch Changes

- 9cbd9bb: Disabled styling unified: every disabled control uses token colors only (muted text, `--ui-color-bg` fill, `--ui-color-border`) — no `opacity`. `Button` disabled now looks the same across variants (ghost keeps no fill/border); `Tabs` and `Pagination` drop the extra opacity so contrast stays predictable in dark and forced-colors modes.
- 055134e: `Table`: `numeric` cells and header cells no longer wrap (`white-space: nowrap`), so values like durations and currency keep their unit on one line.

## 0.3.0

### Minor Changes

- 13b3e52: Add `Pagination` (controlled `page` / `pageCount` / `onPageChange`, `siblingCount` / `boundaryCount`, `showFirstLast`, `labels`) and export `paginationRange`.
- 3b35dba: Add `Table` (presentation only: `Table` / `TableHead` / `TableBody` / `TableRow` / `TableHeaderCell` / `TableCell` / `TableEmptyRow`; `density`, `stickyHeader`, `numeric`, `selected` / `interactive` rows, `sortDirection` → `aria-sort` + `onSort` header button). Sorting and filtering stay in the app.

### Patch Changes

- ba01350: Forced-colors (high-contrast) support: color tokens remap to system colors under `@media (forced-colors: active)`; toggles, selection, tabs, badges, timeline markers, skeletons and popups keep their shape and state. Highlight fills with text opt out of the browser backplate (`forced-color-adjust: none`).
- c44dade: `Tabs`: arrow keys now activate the focused tab (`activateOnFocus`), as documented — Base UI defaults to manual activation. Internal cleanup with no API change: `Input` / `Textarea` / `Select` trigger share one field style; icon sizes and popup offsets are constants.

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
