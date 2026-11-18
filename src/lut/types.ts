export type Vec3 = [number, number, number];

/** 3D LUT. data is RGB float triplets, length size^3 * 3, red index changes fastest (Adobe .cube order). */
export interface Lut3D {
  size: number;
  domainMin: Vec3;
  domainMax: Vec3;
  data: Float32Array;
  title?: string;
}

/** 1D LUT. data is RGB float triplets, length size * 3. */
export interface Lut1D {
  size: number;
  domainMin: Vec3;
  domainMax: Vec3;
  data: Float32Array;
  title?: string;
}
