import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ImageMagick,
  initialize as initializeImageMagick,
  MagickColor,
  MagickFormat,
} from "https://deno.land/x/imagemagick_deno@0.0.31/mod.ts";
import { cropToSquareWebp } from "./square-crop.ts";

await initializeImageMagick();

function makeNonSquarePng(w: number, h: number): Uint8Array {
  let out = new Uint8Array();
  ImageMagick.read(new MagickColor("#3366cc"), w, h, (img) => {
    img.write(MagickFormat.Png, (d) => (out = new Uint8Array(d)));
  });
  return out;
}

function dimsOf(bytes: Uint8Array): { w: number; h: number; format: string } {
  let r = { w: 0, h: 0, format: "" };
  ImageMagick.read(bytes, (img) => {
    r = { w: img.width, h: img.height, format: img.format.toString() };
  });
  return r;
}

Deno.test("cropToSquareWebp produces an exact square at the requested size", async () => {
  const input = makeNonSquarePng(200, 400);
  const output = await cropToSquareWebp(input, 256, 80);
  const { w, h, format } = dimsOf(output);
  assertEquals(w, 256);
  assertEquals(h, 256);
  assertEquals(format.toLowerCase().includes("webp"), true);
});

Deno.test("cropToSquareWebp on a landscape input is also square", async () => {
  const input = makeNonSquarePng(800, 300);
  const output = await cropToSquareWebp(input, 256, 80);
  const { w, h } = dimsOf(output);
  assertEquals(w, 256);
  assertEquals(h, 256);
});
