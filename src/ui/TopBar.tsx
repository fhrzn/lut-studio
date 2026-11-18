import { useEffect, useRef, useState } from 'react';
import { listRecipes } from '@/recipe/store';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import { openImageFile, openSavedRecipe, requestSave, startNewRecipe } from './actions';
import { ACCEPTED_IMAGE_TYPES } from './layerMeta';
import { useEditorStore, useIsDirty } from './useEditorStore';
import styles from './Editor.module.css';

const NEW_RECIPE = '__new__';

function RecipePicker() {
  const recipeId = useRecipeStore((s) => s.recipe.id);
  const persisted = useEditorStore((s) => s.persisted);
  const savedSnapshot = useEditorStore((s) => s.savedSnapshot);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);

  // Re-read after each save/open so the list includes new and renamed recipes.
  useEffect(() => {
    let cancelled = false;
    void listRecipes().then((all) => {
      if (!cancelled) setOptions(all.map((r) => ({ id: r.id, name: r.name })));
    });
    return () => {
      cancelled = true;
    };
  }, [recipeId, persisted, savedSnapshot]);

  return (
    <select
      className={styles.select}
      aria-label="Open recipe"
      value={persisted && options.some((o) => o.id === recipeId) ? recipeId : ''}
      onChange={(e) => {
        const value = e.target.value;
        if (value === NEW_RECIPE) startNewRecipe();
        else if (value !== '') void openSavedRecipe(value);
      }}
    >
      <option value="" disabled>
        Recipes…
      </option>
      <option value={NEW_RECIPE}>New recipe</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function TopBar() {
  const name = useRecipeStore((s) => s.recipe.name);
  const canUndo = useRecipeStore((s) => s.past.length > 0);
  const canRedo = useRecipeStore((s) => s.future.length > 0);
  const persisted = useEditorStore((s) => s.persisted);
  const dirty = useIsDirty();
  const fileInput = useRef<HTMLInputElement>(null);
  const { renameRecipe, beginEdit, endEdit, undo, redo } = useRecipeStore.getState();

  return (
    <header className={styles.topBar}>
      <h1 className={styles.brand}>LUT Studio</h1>
      <button type="button" className={styles.button} onClick={() => fileInput.current?.click()}>
        Open image…
      </button>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        aria-label="Open image file"
        data-testid="image-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void openImageFile(file);
        }}
      />
      <RecipePicker />
      <input
        className={styles.nameInput}
        aria-label="Recipe name"
        value={name}
        onFocus={beginEdit}
        onChange={(e) => renameRecipe(e.target.value)}
        onBlur={(e) => {
          if (e.target.value.trim() === '') renameRecipe('Untitled');
          endEdit();
        }}
      />
      <span
        className={dirty ? styles.dirty : styles.clean}
        role="status"
        aria-live="polite"
        data-testid="save-state"
      >
        {dirty ? '● Unsaved changes' : persisted ? 'Saved' : ''}
      </span>
      <span className={styles.spacer} />
      <button
        type="button"
        className={styles.button}
        onClick={undo}
        disabled={!canUndo}
        aria-keyshortcuts="Control+Z Meta+Z"
      >
        Undo
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={redo}
        disabled={!canRedo}
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
      >
        Redo
      </button>
      <button
        type="button"
        className={styles.primary}
        onClick={requestSave}
        aria-keyshortcuts="Control+S Meta+S"
      >
        Save
      </button>
      <button
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        disabled
        title="Export arrives with the batch export task"
      >
        Export ▾
      </button>
    </header>
  );
}
