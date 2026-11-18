import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import { saveOpenRecipe } from './actions';
import { useEditorStore } from './useEditorStore';
import styles from './Editor.module.css';

export function SaveDialog() {
  const open = useEditorStore((s) => s.saveDialogOpen);
  if (!open) return null;
  return <Dialog />;
}

function Dialog() {
  const [name, setName] = useState(() => useRecipeStore.getState().recipe.name);
  const input = useRef<HTMLInputElement>(null);
  const close = (): void => useEditorStore.getState().setSaveDialogOpen(false);

  useEffect(() => input.current?.select(), []);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (name.trim() === '') return;
    if (await saveOpenRecipe(name)) close();
  };

  return (
    <div className={styles.backdrop} onMouseDown={close}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        onSubmit={(e) => void submit(e)}
      >
        <h2 id="save-title" className={styles.panelTitle}>
          Save recipe
        </h2>
        <label className={styles.field}>
          Recipe name
          <input
            ref={input}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.button} onClick={close}>
            Cancel
          </button>
          <button type="submit" className={styles.primary} disabled={name.trim() === ''}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
