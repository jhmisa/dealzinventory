// Center-crop an arbitrary image to a square and encode it as WebP, via ImageMagick-WASM.
// Pure + side-effect-free: bytes in, bytes out. Used by save-product-photos.
import {
  Gravity,
  ImageMagick,
  initialize as initializeImageMagick,
  MagickFormat,
  MagickGeometry,
} from "https://deno.land/x/imagemagick_deno@0.0.31/mod.ts";

let _initialized: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!_initialized) _initialized = initializeImageMagick();
  return _initialized;
}

/**
 * Center-crop `input` to a square (the largest centered square that fits), resize to
 * `size`x`size`, and encode as WebP at `quality` (0-100). Returns the WebP bytes.
 */
export async function cropToSquareWebp(
  input: Uint8Array,
  size: number,
  quality: number,
): Promise<Uint8Array> {
  await ensureInit();
  let out = new Uint8Array();
  ImageMagick.read(input, (img) => {
    const side = Math.min(img.width, img.height);
    img.crop(new MagickGeometry(side, side), Gravity.Center);
    img.resetPage();
    const geom = new MagickGeometry(size, size);
    geom.ignoreAspectRatio = true;
    img.resize(geom);
    img.quality = quality;
    img.write(MagickFormat.WebP, (data) => {
      out = new Uint8Array(data); // copy out — `data` is only valid inside the callback
    });
  });
  return out;
}
