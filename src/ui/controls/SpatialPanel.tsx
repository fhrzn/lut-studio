import { DEFAULT_SPATIAL } from '@/recipe/factory';
import { useRecipeStore } from '@/recipe/useRecipeStore';
import { Slider } from './Slider';
import styles from './controls.module.css';

/** Post-LUT effects: grain and vignette. */
export function SpatialPanel() {
  const spatial = useRecipeStore((s) => s.recipe.spatial);
  const set = useRecipeStore.getState().setSpatial;
  return (
    <section aria-label="Grain and vignette" className={styles.controls}>
      <h3 className={styles.controlsTitle}>Grain &amp; vignette</h3>
      <Slider
        label="Grain amount"
        value={spatial.grainAmount}
        min={0}
        max={100}
        defaultValue={DEFAULT_SPATIAL.grainAmount}
        onChange={(grainAmount) => set({ grainAmount })}
      />
      <Slider
        label="Grain size"
        value={spatial.grainSize}
        min={0}
        max={100}
        defaultValue={DEFAULT_SPATIAL.grainSize}
        onChange={(grainSize) => set({ grainSize })}
      />
      <Slider
        label="Vignette amount"
        value={spatial.vignetteAmount}
        min={-100}
        max={100}
        defaultValue={DEFAULT_SPATIAL.vignetteAmount}
        onChange={(vignetteAmount) => set({ vignetteAmount })}
      />
      <Slider
        label="Vignette midpoint"
        value={spatial.vignetteMidpoint}
        min={0}
        max={100}
        defaultValue={DEFAULT_SPATIAL.vignetteMidpoint}
        onChange={(vignetteMidpoint) => set({ vignetteMidpoint })}
      />
    </section>
  );
}
