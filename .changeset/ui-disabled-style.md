---
'galley-ui': patch
---

Disabled styling unified: every disabled control uses token colors only (muted text, `--ui-color-bg` fill, `--ui-color-border`) — no `opacity`. `Button` disabled now looks the same across variants (ghost keeps no fill/border); `Tabs` and `Pagination` drop the extra opacity so contrast stays predictable in dark and forced-colors modes.
