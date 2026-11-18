import { useEffect, useState, type DragEvent } from 'react';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import { openImageFile, requestSave, restoreLastRecipe } from './actions';
import { LayerControls } from './controls/LayerControls';
import { SpatialPanel } from './controls/SpatialPanel';
import { LayerPanel } from './LayerPanel';
import { SaveDialog } from './SaveDialog';
import { TopBar } from './TopBar';
import { useEditorStore } from './useEditorStore';
import { Viewport } from './Viewport';
import styles from './Editor.module.css';

const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'file']);

/** True where the browser's own text editing (including its undo) should win. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        requestSave();
      } else if (mod && (key === 'z' || key === 'y') && !isTextEntry(e.target)) {
        e.preventDefault();
        const { undo, redo } = useRecipeStore.getState();
        if (key === 'y' || e.shiftKey) redo();
        else undo();
      } else if (e.key === '\\' && !mod && !e.repeat && !isTextEntry(e.target)) {
        e.preventDefault();
        useEditorStore.getState().toggleBefore();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

function Notice() {
  const notice = useEditorStore((s) => s.notice);
  useEffect(() => {
    if (notice?.kind !== 'info') return;
    const timer = setTimeout(() => useEditorStore.getState().setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return (
    <div
      className={notice.kind === 'error' ? styles.noticeError : styles.noticeInfo}
      role={notice.kind === 'error' ? 'alert' : 'status'}
      data-testid="notice"
    >
      <span>{notice.text}</span>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Dismiss message"
        onClick={() => useEditorStore.getState().setNotice(null)}
      >
        ✕
      </button>
    </div>
  );
}

function SidePanel() {
  const selectedId = useEditorStore((s) => s.selectedLayerId);
  const layer = useRecipeStore((s) => s.recipe.layers.find((l) => l.id === selectedId));
  return (
    <aside className={styles.side} aria-label="Layer controls">
      <LayerPanel />
      <div className={styles.controlsScroll}>
        {layer ? (
          <LayerControls key={layer.id} layer={layer} />
        ) : (
          <p className={styles.empty}>Select a layer to edit it.</p>
        )}
        <SpatialPanel />
      </div>
    </aside>
  );
}

export function Editor() {
  const [dragging, setDragging] = useState(false);
  useEditorShortcuts();
  useEffect(() => {
    void restoreLastRecipe();
  }, []);

  const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div
      className={styles.editor}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void openImageFile(file);
      }}
    >
      <div>
        <TopBar />
        <Notice />
      </div>
      <main className={styles.main}>
        <Viewport />
        <SidePanel />
      </main>
      <SaveDialog />
      {dragging && <div className={styles.dropOverlay}>Drop a JPEG, PNG or WebP to open it</div>}
    </div>
  );
}
