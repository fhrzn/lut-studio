import { useRef } from 'react';
import { importCubeIntoLayer } from '../actions';
import styles from './controls.module.css';

interface Props {
  layerId: string;
  name: string;
  lutId: string;
}

export function LutControls({ layerId, name, lutId }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.lut}>
      <p className={styles.lutName} data-testid="lut-name">
        {lutId === '' ? 'No LUT loaded' : name}
      </p>
      <button type="button" className={styles.button} onClick={() => input.current?.click()}>
        {lutId === '' ? 'Import .cube…' : 'Replace .cube…'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".cube"
        hidden
        aria-label="Import .cube file"
        data-testid="cube-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // allow re-importing the same file after fixing it
          if (file) void importCubeIntoLayer(layerId, file);
        }}
      />
    </div>
  );
}
