import { useCallback } from 'react';
import type { Layer, LayerType } from '@/recipe/types';
import { useRecipeStore, type ParamsOf } from '@/recipe/useRecipeStore';
import { LAYER_LABELS } from '../layerMeta';
import { CurveEditor } from './CurveEditor';
import { HslEditor } from './HslEditor';
import { LutControls } from './LutControls';
import { Slider } from './Slider';
import styles from './controls.module.css';

/** Returns a setter that merges a partial params object into the layer. */
function useParams<T extends LayerType>(id: string) {
  return useCallback(
    (params: Partial<ParamsOf<T>>) => useRecipeStore.getState().updateLayer<T>(id, { params }),
    [id],
  );
}

const KELVIN_TRACK = 'linear-gradient(90deg, #4a7bd8, #f0f0f0, #e8a63a)';
const TINT_TRACK = 'linear-gradient(90deg, #3fbf5a, #f0f0f0, #c443b8)';
const hueTrack = 'linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)';

function Params({ layer }: { layer: Layer }) {
  const id = layer.id;
  const exposure = useParams<'exposure'>(id);
  const wb = useParams<'whiteBalance'>(id);
  const contrast = useParams<'contrast'>(id);
  const split = useParams<'splitTone'>(id);
  const sat = useParams<'saturation'>(id);
  const fade = useParams<'fade'>(id);
  const mono = useParams<'monochrome'>(id);

  switch (layer.type) {
    case 'exposure':
      return (
        <Slider
          label="Exposure (EV)"
          value={layer.params.ev}
          min={-5}
          max={5}
          step={0.05}
          defaultValue={0}
          onChange={(ev) => exposure({ ev })}
        />
      );
    case 'whiteBalance':
      return (
        <>
          <Slider
            label="Temperature"
            value={layer.params.temperature}
            min={-100}
            max={100}
            defaultValue={0}
            trackBackground={KELVIN_TRACK}
            onChange={(temperature) => wb({ temperature })}
          />
          <Slider
            label="Tint"
            value={layer.params.tint}
            min={-100}
            max={100}
            defaultValue={0}
            trackBackground={TINT_TRACK}
            onChange={(tint) => wb({ tint })}
          />
        </>
      );
    case 'contrast':
      return (
        <Slider
          label="Contrast"
          value={layer.params.amount}
          min={-100}
          max={100}
          defaultValue={0}
          onChange={(amount) => contrast({ amount })}
        />
      );
    case 'curve':
      return <CurveEditor layerId={id} params={layer.params} />;
    case 'hsl':
      return <HslEditor layerId={id} params={layer.params} />;
    case 'splitTone':
      return (
        <>
          <h4 className={styles.groupTitle}>Shadows</h4>
          <Slider
            label="Shadow hue"
            value={layer.params.shadowHue}
            min={0}
            max={360}
            defaultValue={0}
            trackBackground={hueTrack}
            onChange={(shadowHue) => split({ shadowHue })}
          />
          <Slider
            label="Shadow saturation"
            value={layer.params.shadowSat}
            min={0}
            max={100}
            defaultValue={0}
            onChange={(shadowSat) => split({ shadowSat })}
          />
          <h4 className={styles.groupTitle}>Highlights</h4>
          <Slider
            label="Highlight hue"
            value={layer.params.highlightHue}
            min={0}
            max={360}
            defaultValue={0}
            trackBackground={hueTrack}
            onChange={(highlightHue) => split({ highlightHue })}
          />
          <Slider
            label="Highlight saturation"
            value={layer.params.highlightSat}
            min={0}
            max={100}
            defaultValue={0}
            onChange={(highlightSat) => split({ highlightSat })}
          />
          <Slider
            label="Balance"
            value={layer.params.balance}
            min={-100}
            max={100}
            defaultValue={0}
            onChange={(balance) => split({ balance })}
          />
        </>
      );
    case 'saturation':
      return (
        <>
          <Slider
            label="Saturation"
            value={layer.params.saturation}
            min={-100}
            max={100}
            defaultValue={0}
            onChange={(saturation) => sat({ saturation })}
          />
          <Slider
            label="Vibrance"
            value={layer.params.vibrance}
            min={-100}
            max={100}
            defaultValue={0}
            onChange={(vibrance) => sat({ vibrance })}
          />
        </>
      );
    case 'fade':
      return (
        <Slider
          label="Fade"
          value={layer.params.amount}
          min={0}
          max={100}
          defaultValue={0}
          onChange={(amount) => fade({ amount })}
        />
      );
    case 'monochrome':
      return (
        <>
          <Slider
            label="Red"
            value={layer.params.red}
            min={-200}
            max={300}
            defaultValue={30}
            onChange={(red) => mono({ red })}
          />
          <Slider
            label="Green"
            value={layer.params.green}
            min={-200}
            max={300}
            defaultValue={59}
            onChange={(green) => mono({ green })}
          />
          <Slider
            label="Blue"
            value={layer.params.blue}
            min={-200}
            max={300}
            defaultValue={11}
            onChange={(blue) => mono({ blue })}
          />
        </>
      );
    case 'lut':
      return <LutControls layerId={id} name={layer.params.name} lutId={layer.params.lutId} />;
  }
}

/** Controls for the selected layer: its parameters, then opacity (intensity for LUTs). */
export function LayerControls({ layer }: { layer: Layer }) {
  return (
    <section aria-label={`${LAYER_LABELS[layer.type]} controls`} className={styles.controls}>
      <h3 className={styles.controlsTitle}>{LAYER_LABELS[layer.type]}</h3>
      <Params layer={layer} />
      <div className={styles.opacityRow}>
        <Slider
          label={layer.type === 'lut' ? 'Intensity' : 'Opacity'}
          value={Math.round(layer.opacity * 100)}
          min={0}
          max={100}
          defaultValue={100}
          onChange={(v) => useRecipeStore.getState().updateLayer(layer.id, { opacity: v / 100 })}
        />
      </div>
    </section>
  );
}
