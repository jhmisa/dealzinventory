/**
 * Client-side image processing utility for Dealz inventory system.
 *
 * Takes a raw image File, center-crops to square, then produces three
 * WebP blobs at standard sizes (full / display / thumbnail).
 */

export const IMAGE_SIZES = {
  full: { width: 2048, height: 2048, quality: 0.85 },
  display: { width: 1080, height: 1080, quality: 0.82 },
  thumbnail: { width: 256, height: 256, quality: 0.80 },
} as const;

type SizeKey = keyof typeof IMAGE_SIZES;

export interface ProcessedImage {
  /** UUID identifying this image set */
  id: string;
  full: Blob;
  display: Blob;
  thumbnail: Blob;
}

export interface ImageUrls {
  full: string;
  display: string;
  thumbnail: string;
}

/**
 * Returns the three storage URLs for a processed image set.
 *
 * @param basePath - Storage path prefix, e.g. "photo-group-media/{photo_group_id}"
 * @param id - The UUID returned from processImage
 */
export function getImageUrls(basePath: string, id: string): ImageUrls {
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  return {
    full: `${base}/${id}_full.webp`,
    display: `${base}/${id}_display.webp`,
    thumbnail: `${base}/${id}_thumb.webp`,
  };
}

/**
 * Check whether the browser supports encoding to WebP via canvas.
 * Falls back to JPEG if not supported.
 */
function detectWebPSupport(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

/** Cached result of WebP support detection */
let webpSupported: boolean | null = null;

function getOutputFormat(): { mimeType: string; extension: string } {
  if (webpSupported === null) {
    webpSupported = detectWebPSupport();
  }
  return webpSupported
    ? { mimeType: "image/webp", extension: "webp" }
    : { mimeType: "image/jpeg", extension: "jpeg" };
}

/**
 * Load a File into an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

/**
 * Center-crop the source image to a square, then resize to the target
 * dimensions and compress to the chosen output format.
 */
function resizeAndCompress(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  quality: number,
  mimeType: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Could not get canvas 2d context"));
      return;
    }

    // Determine the largest centered square within the source image
    const srcSize = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - srcSize) / 2;
    const sy = (img.naturalHeight - srcSize) / 2;

    // Draw the center-cropped square into the target-sized canvas
    ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas toBlob returned null"));
        }
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Generate a v4-style UUID using crypto.randomUUID when available,
 * with a fallback for older browsers.
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback using getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Process a raw image file into three standard sizes.
 *
 * Pipeline:
 *   1. Load image into an HTMLImageElement
 *   2. For each size: center-crop to square, resize, compress to WebP (or JPEG fallback)
 *   3. Return the three blobs along with a generated UUID
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  const img = await loadImage(file);
  const { mimeType } = getOutputFormat();
  const id = generateId();

  const sizeKeys: SizeKey[] = ["full", "display", "thumbnail"];

  const blobs = await Promise.all(
    sizeKeys.map((key) => {
      const { width, height, quality } = IMAGE_SIZES[key];
      return resizeAndCompress(img, width, height, quality, mimeType);
    }),
  );

  return {
    id,
    full: blobs[0],
    display: blobs[1],
    thumbnail: blobs[2],
  };
}
