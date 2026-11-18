import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import { addLayerOfType, deleteLayer, duplicateLayer } from './actions';
import { LAYER_LABELS, LAYER_TYPES } from './layerMeta';
import { useEditorStore } from './useEditorStore';
import styles from './Editor.module.css';

function AddLayerMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onPointerDown = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent): void => {
    const current = items.current.findIndex((el) => el === document.activeElement);
    if (e.key === 'Escape') {
      setOpen(false);
      (root.current?.querySelector('button') as HTMLButtonElement | null)?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = items.current.length;
      items.current[(current + (e.key === 'ArrowDown' ? 1 : -1) + n) % n]?.focus();
    }
  };

  return (
    <div className={styles.addMenu} ref={root}>
      <button
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        + Add layer
      </button>
      {open && (
        <div role="menu" aria-label="Layer types" className={styles.menu} onKeyDown={onMenuKey}>
          {LAYER_TYPES.map((type, i) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              ref={(el) => {
                items.current[i] = el;
              }}
              className={styles.menuItem}
              onClick={() => {
                addLayerOfType(type);
                setOpen(false);
              }}
            >
              {LAYER_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LayerPanel() {
  const layers = useRecipeStore((s) => s.recipe.layers);
  const selectedId = useEditorStore((s) => s.selectedLayerId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);

  // Reordering re-inserts the row's DOM node, which drops focus; put it back.
  useLayoutEffect(() => {
    if (refocus.current) rows.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [layers]);

  const { moveLayer, toggleLayer } = useRecipeStore.getState();
  const select = useEditorStore.getState().selectLayer;

  const move = (id: string, to: number): void => {
    refocus.current = id;
    moveLayer(id, to);
  };

  const onRowKey = (e: KeyboardEvent, index: number, id: string): void => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      if (e.altKey) {
        move(id, index + delta);
      } else {
        const target = layers[index + delta];
        if (target) {
          select(target.id);
          rows.current.get(target.id)?.focus();
        }
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteLayer(id);
    }
  };

  return (
    <section aria-label="Layers" className={styles.layerPanel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Layers</h2>
        <AddLayerMenu />
      </div>
      {layers.length === 0 ? (
        <p className={styles.empty}>No layers yet. Add one to start grading.</p>
      ) : (
        <ul
          className={styles.layerList}
          aria-label="Layer stack"
          onDragLeave={() => setDropIndex(null)}
        >
          {layers.map((layer, index) => {
            const label = LAYER_LABELS[layer.type];
            const detail =
              layer.type === 'lut' && layer.params.name !== '' ? layer.params.name : null;
            return (
              <li
                key={layer.id}
                className={[
                  styles.layerRow,
                  layer.id === selectedId ? styles.layerSelected : '',
                  layer.enabled ? '' : styles.layerHidden,
                  dropIndex === index ? styles.dropBefore : '',
                  dropIndex === index + 1 && index === layers.length - 1 ? styles.dropAfter : '',
                ].join(' ')}
                draggable
                onDragStart={(e) => {
                  setDragId(layer.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', layer.id);
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDropIndex(e.clientY < rect.top + rect.height / 2 ? index : index + 1);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = layers.findIndex((l) => l.id === dragId);
                  if (from >= 0 && dropIndex !== null) {
                    move(layers[from]?.id ?? '', dropIndex > from ? dropIndex - 1 : dropIndex);
                  }
                  setDragId(null);
                  setDropIndex(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
              >
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`${layer.enabled ? 'Hide' : 'Show'} ${label}`}
                  aria-pressed={layer.enabled}
                  onClick={() => toggleLayer(layer.id)}
                >
                  {layer.enabled ? '◉' : '○'}
                </button>
                <button
                  type="button"
                  className={styles.layerName}
                  aria-pressed={layer.id === selectedId}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete"
                  data-testid="layer-row"
                  ref={(el) => {
                    if (el) rows.current.set(layer.id, el);
                    else rows.current.delete(layer.id);
                  }}
                  onClick={() => select(layer.id)}
                  onKeyDown={(e) => onRowKey(e, index, layer.id)}
                >
                  <span>{label}</span>
                  {detail && <span className={styles.layerDetail}>{detail}</span>}
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Move ${label} up`}
                  disabled={index === 0}
                  onClick={() => move(layer.id, index - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Move ${label} down`}
                  disabled={index === layers.length - 1}
                  onClick={() => move(layer.id, index + 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Duplicate ${label}`}
                  onClick={() => duplicateLayer(layer.id)}
                >
                  ⧉
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Delete ${label}`}
                  onClick={() => deleteLayer(layer.id)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.hint}>Applied top to bottom. Alt+↑/↓ reorders the focused layer.</p>
    </section>
  );
}
