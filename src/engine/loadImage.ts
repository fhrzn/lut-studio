import { fitLongEdge } from './tiles';

export const PREVIEW_MAX_EDGE = 2048;

export interface LoadedImage {
  /** Full-resolution, EXIF-oriented bitmap. */
  bitmap: ImageBitmap;
  /** Downscaled copy (long edge <= 2048 px) for interactive rendering. */
  preview: ImageBitmap;
  /** Oriented full-resolution size (equals bitmap.width / bitmap.height). */
  width: number;
  height: number;
}

/** Decodes a photo, applying EXIF orientation, and builds the interactive preview. */
export async function loadImage(file: File): Promise<LoadedImage> {
  let bitmap: ImageBitmap;
  try {
    // premultiplyAlpha 'none' keeps RGB intact; the engine ignores alpha.
    bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      premultiplyAlpha: 'none',
    });
  } catch (cause) {
    throw new Error(`Could not decode image "${file.name}"`, { cause });
  }

  const { width, height } = bitmap;
  const target = fitLongEdge(width, height, PREVIEW_MAX_EDGE);
  try {
    // Resize from the already-oriented bitmap: resize options on a file source are ambiguous
    // about whether they apply before or after the EXIF rotation.
    const preview =
      target.width === width && target.height === height
        ? await createImageBitmap(bitmap)
        : await createImageBitmap(bitmap, {
            resizeWidth: target.width,
            resizeHeight: target.height,
            resizeQuality: 'high',
          });
    return { bitmap, preview, width, height };
  } catch (cause) {
    bitmap.close();
    throw new Error(`Could not build preview for "${file.name}"`, { cause });
  }
}
