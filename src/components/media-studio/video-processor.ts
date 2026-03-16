import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VIDEO_SPECS = {
  width: 1080,
  height: 1080,
  maxDurationSec: 60,
  maxSizeBytes: 25 * 1024 * 1024,
  crf: 23,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcessedVideo {
  blob: Blob;
  fileName: string;
  durationSec: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Singleton FFmpeg instance (lazy-loaded)
// ---------------------------------------------------------------------------

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

/**
 * Load and initialise FFmpeg.wasm.
 *
 * The instance is created once (singleton) and reused across calls.
 * Uses `toBlobURL` so the WASM/JS assets are served from blob URLs,
 * which avoids CORS and SharedArrayBuffer header issues in dev.
 */
export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg();
      // Use the single-threaded UMD build so we don't require
      // Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy headers
      // that Vite's dev server does not set by default.
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      const coreURL = await toBlobURL(
        `${baseURL}/ffmpeg-core.js`,
        "text/javascript",
      );
      const wasmURL = await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm",
      );

      await ffmpeg.load({ coreURL, wasmURL });
      ffmpegInstance = ffmpeg;
    })();
  }

  await loadPromise;

  if (!ffmpegInstance) {
    // Reset so a subsequent call can retry.
    loadPromise = null;
    throw new Error("FFmpeg failed to load");
  }

  return ffmpegInstance;
}

// ---------------------------------------------------------------------------
// Video processing
// ---------------------------------------------------------------------------

/**
 * Process a video file:
 *  1. Strip audio
 *  2. Crop / pad to 1080x1080 (square, letterboxed)
 *  3. Compress with H.264 CRF 23
 *  4. Limit duration to 60 s
 *  5. Output MP4 (fast-start)
 *
 * @param file       The source video `File` from an `<input>` or drop event.
 * @param onProgress Optional callback receiving a 0-1 progress value.
 * @returns          A `ProcessedVideo` with the resulting Blob and metadata.
 */
export async function processVideo(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ProcessedVideo> {
  const ffmpeg = await loadFFmpeg();

  const inputName = "input.mp4";
  const outputName = "output.mp4";

  // ------------------------------------------------------------------
  // Hook up progress reporting
  // ------------------------------------------------------------------
  const progressHandler = ({ progress }: { progress: number; time: number }) => {
    // FFmpeg reports progress as 0-1 (may exceed 1 briefly).
    onProgress?.(Math.min(Math.max(progress, 0), 1));
  };

  ffmpeg.on("progress", progressHandler);

  try {
    // ----------------------------------------------------------------
    // Write input file into the WASM virtual filesystem
    // ----------------------------------------------------------------
    const inputData = await fetchFile(file);
    await ffmpeg.writeFile(inputName, inputData);

    // ----------------------------------------------------------------
    // Build the ffmpeg command
    // ----------------------------------------------------------------
    const { width, height, maxDurationSec, crf } = VIDEO_SPECS;

    const vf = [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
    ].join(",");

    const exitCode = await ffmpeg.exec([
      "-i",
      inputName,
      "-an",
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-crf",
      String(crf),
      "-t",
      String(maxDurationSec),
      "-movflags",
      "+faststart",
      outputName,
    ]);

    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}`);
    }

    // ----------------------------------------------------------------
    // Read the output and build the result
    // ----------------------------------------------------------------
    const outputData = await ffmpeg.readFile(outputName);

    if (typeof outputData === "string") {
      throw new Error("Unexpected string output from FFmpeg readFile");
    }

    const blob = new Blob([outputData.buffer], { type: "video/mp4" });

    // ----------------------------------------------------------------
    // Extract duration via ffprobe (best-effort)
    // ----------------------------------------------------------------
    const durationSec = await probeDuration(ffmpeg, outputName);

    const uuid = crypto.randomUUID();
    const fileName = `${uuid}.mp4`;

    return {
      blob,
      fileName,
      durationSec,
      width,
      height,
    };
  } finally {
    // ----------------------------------------------------------------
    // Clean up the virtual filesystem
    // ----------------------------------------------------------------
    ffmpeg.off("progress", progressHandler);
    await safeDelete(ffmpeg, inputName);
    await safeDelete(ffmpeg, outputName);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Use ffprobe to read the duration of a file already in the virtual FS.
 * Returns 0 if the probe fails for any reason.
 */
async function probeDuration(
  ffmpeg: FFmpeg,
  fileName: string,
): Promise<number> {
  const probeOutput = "probe.txt";
  try {
    const code = await ffmpeg.ffprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      fileName,
      "-o",
      probeOutput,
    ]);

    if (code !== 0) return 0;

    const raw = await ffmpeg.readFile(probeOutput);
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const parsed = parseFloat(text.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  } finally {
    await safeDelete(ffmpeg, probeOutput);
  }
}

/** Delete a file from the virtual FS, ignoring errors if it doesn't exist. */
async function safeDelete(ffmpeg: FFmpeg, path: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(path);
  } catch {
    // file may not exist — ignore
  }
}
