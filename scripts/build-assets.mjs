// Copies ONNX Runtime Web assets into /public/ort and bundles the analysis worker
// into /public/workers so it can be loaded as a classic worker (importScripts) by any bundler.
import { build, context } from "esbuild";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ortDist = join(root, "node_modules", "onnxruntime-web", "dist");
const ortOut = join(root, "public", "ort");
mkdirSync(ortOut, { recursive: true });
for (const f of [
  // combined bundle (WebGPU + WebGL + WebAssembly) used by the analysis worker
  "ort.all.min.js",
  "ort.webgpu.min.js",
  "ort.wasm.min.js",
  "ort.min.js",
  // the WebAssembly runtimes the bundles may pick from, depending on browser features
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
]) {
  const srcPath = join(ortDist, f);
  if (!existsSync(srcPath)) {
    // fail loudly: a missing runtime file otherwise only shows up as a broken analysis in the browser
    console.error(`build-assets: missing ${f} in onnxruntime-web/dist — check the installed onnxruntime-web version.`);
    process.exit(1);
  }
  copyFileSync(srcPath, join(ortOut, f));
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
