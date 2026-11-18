/** Largest size with the image's aspect ratio that fits `avail`. */
export function fitSize(
  image: { width: number; height: number },
  avail: { width: number; height: number },
): { width: number; height: number } {
  const scale = Math.min(avail.width / image.width, avail.height / image.height);
  if (!(scale > 0)) return { width: 0, height: 0 };
  return { width: Math.floor(image.width * scale), height: Math.floor(image.height * scale) };
}
