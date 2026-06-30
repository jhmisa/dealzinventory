// Center-crop an arbitrary image to a square and encode it as WebP, via ImageMagick-WASM.
// Pure + side-effect-free: bytes in, bytes out. Used by save-product-photos.
// We deliberately import the npm magick-wasm package directly rather than
// deno.land/x/imagemagick_deno's `initialize()`. That wrapper calls
// `caches.open("magick_native")` to cache the wasm — but the Supabase edge
// runtime defines `caches` yet throws "Web Cache is not available in this
// context" when it's used, so the wrapper's `typeof caches === "undefined"`
// fast-path is skipped and init blows up. We fetch the wasm ourselves and feed
// the bytes straight to `initializeImageMagick`, which never touches the Cache API.
import {
  Gravity,
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
} from "npm:@imagemagick/magick-wasm@0.0.31";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.31/dist/magick.wasm";

let _initialized: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!_initialized) {
    _initialized = (async () => {
      const res = await fetch(WASM_URL);
      if (!res.ok) throw new Error(`magick.wasm fetch failed: HTTP ${res.status}`);
      await initializeImageMagick(new Uint8Array(await res.arrayBuffer()));
    })();
  }
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
