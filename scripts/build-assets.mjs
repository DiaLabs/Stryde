// Copies ONNX Runtime Web assets into /public/ort and bundles the analysis worker
// into /public/workers so it can be loaded as a classic worker (importScripts) by any bundler.
import { build, context } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ortDist = join(root, "node_modules", "onnxruntime-web", "dist");
const ortOut = join(root, "public", "ort");
mkdirSync(ortOut, { recursive: true });
for (const f of [
  "ort.webgpu.min.js",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
]) {
  copyFileSync(join(ortDist, f), join(ortOut, f));
}

const options = {
  absWorkingDir: root,
  entryPoints: ["./src/workers/analysis.worker.ts"],
  outfile: "public/workers/analysis.worker.js",
  bundle: true,
  preserveSymlinks: true,
  format: "iife",
  target: "es2020",
  minify: !process.argv.includes("--watch"),
  sourcemap: process.argv.includes("--watch") ? "inline" : false,
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
