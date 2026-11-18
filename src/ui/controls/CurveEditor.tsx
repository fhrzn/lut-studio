import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { CurvePoint } from '@/recipe/types';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import { curvePath, insertPoint, movePoint, removePoint } from '../curveMath';
import styles from './controls.module.css';

type Channel = 'master' | 'r' | 'g' | 'b';

const CHANNELS: { id: Channel; label: string; color: string }[] = [
  { id: 'master', label: 'Master', color: '#e6e6e6' },
  { id: 'r', label: 'R', color: '#ff5a5a' },
  { id: 'g', label: 'G', color: '#5ad05a' },
  { id: 'b', label: 'B', color: '#6a8cff' },
];

const SIZE = 256;
const PAD = 12;
const KEY_STEP = 0.01;

interface Props {
  layerId: string;
  params: Record<Channel, CurvePoint[]>;
}

export function CurveEditor({ layerId, params }: Props) {
  const [channel, setChannel] = useState<Channel>('master');
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const points = params[channel];
  const color = CHANNELS.find((c) => c.id === channel)?.color ?? '#fff';

  const write = (next: CurvePoint[]): void => {
    if (next !== points)
      useRecipeStore.getState().updateLayer<'curve'>(layerId, { params: { [channel]: next } });
  };

  /** Pointer position in curve space (0..1, y up). */
  const toCurve = (e: PointerEvent): CurvePoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const scale = (SIZE + PAD * 2) / rect.width;
    return {
      x: ((e.clientX - rect.left) * scale - PAD) / SIZE,
      y: 1 - ((e.clientY - rect.top) * scale - PAD) / SIZE,
    };
  };

  const dragIndex = useRef<number | null>(null);

  const onBackgroundDown = (e: PointerEvent<SVGRectElement>): void => {
    const { points: next, index } = insertPoint(points, toCurve(e));
    if (index < 0) return;
    useRecipeStore.getState().beginEdit();
    write(next);
    setActive(index);
    svgRef.current?.setPointerCapture(e.pointerId);
    dragIndex.current = index;
  };

  const onPointDown = (e: PointerEvent<SVGCircleElement>, index: number): void => {
    e.stopPropagation();
    useRecipeStore.getState().beginEdit();
    dragIndex.current = index;
    setActive(index);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent<SVGSVGElement>): void => {
    if (dragIndex.current === null) return;
    write(movePoint(points, dragIndex.current, toCurve(e)));
  };

  const endDrag = (): void => {
    if (dragIndex.current === null) return;
    dragIndex.current = null;
    useRecipeStore.getState().endEdit();
  };

  const onPointKey = (e: KeyboardEvent<SVGCircleElement>, index: number): void => {
    const p = points[index];
    if (!p) return;
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      useRecipeStore.getState().beginEdit();
      write(movePoint(points, index, { x: p.x + move[0], y: p.y + move[1] }));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      write(removePoint(points, index));
      setActive(null);
    }
  };

  const px = (v: number): number => PAD + v * SIZE;
  const py = (v: number): number => PAD + (1 - v) * SIZE;

  return (
    <div className={styles.curve}>
      <div role="tablist" aria-label="Curve channel" className={styles.tabs}>
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={channel === c.id}
            className={channel === c.id ? styles.tabActive : styles.tab}
            onClick={() => {
              setChannel(c.id);
              setActive(null);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <svg
        ref={svgRef}
        className={styles.curveSvg}
        viewBox={`0 0 ${SIZE + PAD * 2} ${SIZE + PAD * 2}`}
        role="group"
        aria-label={`${channel} curve editor. Click to add a point, arrow keys move the focused point, Delete removes it.`}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyUp={() => useRecipeStore.getState().endEdit()}
      >
        <rect
          x={PAD}
          y={PAD}
          width={SIZE}
          height={SIZE}
          className={styles.curveBg}
          onPointerDown={onBackgroundDown}
        />
        {[0.25, 0.5, 0.75].map((t) => (
          <g key={t} className={styles.curveGrid}>
            <line x1={px(t)} y1={PAD} x2={px(t)} y2={PAD + SIZE} />
            <line x1={PAD} y1={py(t)} x2={PAD + SIZE} y2={py(t)} />
          </g>
        ))}
        <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} className={styles.curveDiagonal} />
        <g transform={`translate(${PAD} ${PAD})`} pointerEvents="none">
          <path d={curvePath(points, SIZE)} fill="none" stroke={color} strokeWidth={2} />
        </g>
        {points.map((p, i) => (
          <circle
            key={i}
            cx={px(p.x)}
            cy={py(p.y)}
            r={active === i ? 7 : 5.5}
            fill={color}
            className={styles.curvePoint}
            tabIndex={0}
            role="slider"
            aria-label={`Point ${i + 1}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p.y * 100)}
            aria-valuetext={`input ${Math.round(p.x * 100)}%, output ${Math.round(p.y * 100)}%`}
            data-testid={`curve-point-${i}`}
            onPointerDown={(e) => onPointDown(e, i)}
            onDoubleClick={() => write(removePoint(points, i))}
            onKeyDown={(e) => onPointKey(e, i)}
            onFocus={() => setActive(i)}
          />
        ))}
      </svg>
      <button
        type="button"
        className={styles.linkButton}
        onClick={() =>
          write([
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ])
        }
      >
        Reset {channel === 'master' ? 'master' : channel.toUpperCase()} curve
      </button>
    </div>
  );
}
