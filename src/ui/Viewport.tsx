import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createRenderer } from '@/engine/createRenderer';
import type { Renderer } from '@/engine/types';
import { fitSize } from './fitSize';
import { createPreviewSync, type PreviewSync } from './previewSync';
import { useEditorStore } from './useEditorStore';
import styles from './Editor.module.css';

const MARGIN = 24;

interface Engine {
  renderer: Renderer;
  sync: PreviewSync;
}

function Divider() {
  const splitX = useEditorStore((s) => s.splitX);
  const setSplitX = useEditorStore.getState().setSplitX;
  const dragging = useRef(false);

  const move = (e: PointerEvent<HTMLDivElement>): void => {
    const box = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!dragging.current || !box || box.width === 0) return;
    setSplitX((e.clientX - box.left) / box.width);
  };
  const onKey = (e: KeyboardEvent): void => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const next: Record<string, number> = {
      ArrowLeft: splitX - step,
      ArrowRight: splitX + step,
      Home: 0,
      End: 1,
    };
    const value = next[e.key];
    if (value === undefined) return;
    e.preventDefault();
    setSplitX(value);
  };

  return (
    <div
      className={styles.divider}
      style={{ left: `${splitX * 100}%` }}
      role="slider"
      tabIndex={0}
      aria-label="Before/after divider"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(splitX * 100)}
      data-testid="split-divider"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={onKey}
    >
      <span className={styles.dividerHandle} aria-hidden />
    </div>
  );
}

function CompareControls() {
  const showBefore = useEditorStore((s) => s.showBefore);
  const split = useEditorStore((s) => s.split);
  const { toggleBefore, setSplit } = useEditorStore.getState();
  return (
    <div className={styles.compare} role="group" aria-label="Before and after">
      <button
        type="button"
        className={styles.button}
        aria-pressed={showBefore}
        aria-keyshortcuts="\"
        onClick={toggleBefore}
      >
        Before <kbd>\</kbd>
      </button>
      <button
        type="button"
        className={styles.button}
        aria-pressed={split}
        onClick={() => setSplit(!split)}
      >
        Split view
      </button>
    </div>
  );
}

export function Viewport() {
  const image = useEditorStore((s) => s.image);
  const split = useEditorStore((s) => s.split);
  const showBefore = useEditorStore((s) => s.showBefore);
  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avail, setAvail] = useState({ width: 0, height: 0 });

  // The canvas is created here, not in JSX, so a re-run of this effect (StrictMode) gets a fresh
  // WebGL context rather than the one `dispose()` just released.
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.className = styles.canvas ?? '';
    canvas.setAttribute('data-testid', 'preview-canvas');
    canvas.setAttribute('aria-label', 'Image preview');
    host.current?.appendChild(canvas);
    let created: Engine | null = null;
    try {
      const renderer = createRenderer(canvas);
      created = { renderer, sync: createPreviewSync(renderer) };
      setEngine(created);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      created?.sync.dispose();
      created?.renderer.dispose();
      canvas.remove();
      setEngine(null);
    };
  }, []);

  useEffect(() => {
    if (!engine || !image) return;
    engine.renderer.setImage(image.preview);
    engine.sync.invalidate();
  }, [engine, image]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = (): void =>
      setAvail({
        width: Math.max(0, el.clientWidth - MARGIN * 2),
        height: Math.max(0, el.clientHeight - MARGIN * 2),
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const box = image ? fitSize(image.preview, avail) : { width: 0, height: 0 };

  return (
    <div className={styles.stage} ref={stage}>
      <div
        className={styles.imageBox}
        style={{ width: box.width, height: box.height, visibility: image ? 'visible' : 'hidden' }}
        data-testid="image-box"
      >
        <div ref={host} className={styles.canvasHost} />
        {image && split && !showBefore && <Divider />}
        {image && showBefore && <span className={styles.badge}>Before</span>}
        {image && split && !showBefore && (
          <>
            <span className={`${styles.badge} ${styles.badgeLeft}`}>Before</span>
            <span className={`${styles.badge} ${styles.badgeRight}`}>After</span>
          </>
        )}
      </div>
      {!image && !error && (
        <p className={styles.placeholder}>Open a photo (JPEG, PNG or WebP) or drop it here.</p>
      )}
      {error && (
        <p className={styles.placeholder} role="alert">
          The preview needs WebGL2: {error}
        </p>
      )}
      {image && <CompareControls />}
    </div>
  );
}
