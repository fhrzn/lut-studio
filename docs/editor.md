# Editor UI (`src/ui`)

`<Editor />` (mounted by `src/app/App.tsx`) is the whole editor screen. Plain React + CSS modules,
dark theme, no component library.

## Data flow

```
sliders / curve / panels ──▶ useRecipeStore ──▶ previewSync ──▶ bakeRecipe ──▶ renderer.setLut ──▶ render
                                  ▲                  (one bake + draw per animation frame)
useEditorStore (image, selection, compare, saved snapshot, notices)
```

- `useRecipeStore` (T4) is the source of truth for the recipe. Edits land in the store immediately;
  `previewSync.ts` coalesces them into one `bakeRecipe` + draw per frame. Spatial-only and
  compare-only changes skip the bake. **`previewSync.ts` is the only caller of `bakeRecipe`** in the UI.
- `useEditorStore` holds UI state: the loaded image, the selected layer, before/after mode and
  the snapshot used for the unsaved-changes indicator.
- `lutCache.ts` keeps parsed LUTs by id so the synchronous `LutResolver` can answer. LUTs are put
  in IndexedDB on import and re-parsed into the cache when a saved recipe is opened.
- `actions.ts` holds the non-React logic (open image, import `.cube`, save/open recipes, layer
  add/duplicate/delete) so it can be unit tested.

## Undo granularity

`beginEdit()` / `endEdit()` on the recipe store bracket a continuous edit; everything in between
is one undo step. Sliders open an edit on pointer down / first arrow key and close it on pointer
up / key up / blur. The curve editor does the same for point drags. The recipe name field is one
step per focus. `setSpatial` and `updateLayer` ignore patches that change no value.

## Keyboard

| Key | Action |
| --- | --- |
| `\` | Toggle before/after |
| Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z (or Ctrl+Y) | Undo / redo (not while typing in a text field) |
| Ctrl/Cmd+S | Save (asks for a name the first time) |
| Alt+↑/↓ on a layer row | Reorder; ↑/↓ alone moves the selection; Delete removes |
| Arrow keys on a curve point | Move it (Shift = 5×); Delete removes interior points |
| Arrow keys / Home / End on the split divider | Move it (Shift = 10%) |

## Saving

Save writes to IndexedDB through `saveRecipe`. The id of the last saved or opened recipe is kept
in `localStorage`, so a reload reopens it. The photo itself is not persisted: reopen it after a
reload. The recipe picker lists everything in IndexedDB (there is no library page yet).
