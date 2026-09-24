// Fetches large runtime assets (YOLO ONNX weights, demo clip) at dev/build time.
// They are stored in Git LFS on GitHub but Vercel does not smudge LFS files, so we
// download the real binaries from GitHub's media CDN instead of committing them.
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = process.env.STRYDE_ASSETS_REPO ?? "DiaLabs/Stryde";
const branch = process.env.STRYDE_ASSETS_BRANCH ?? "main";
const base = `https://media.githubusercontent.com/media/${repo}/${branch}`;

const ASSETS = [
  { dest: "public/models/yolo11n-960.onnx", path: "public/models/yolo11n-960.onnx", minBytes: 1_000_000 },
  { dest: "public/models/yolo11s-960.onnx", path: "public/models/yolo11s-960.onnx", minBytes: 5_000_000 },
  { dest: "public/samples/sample-match.mp4", path: "public/samples/sample-match.mp4", minBytes: 100_000 },
];

function isLfsPointer(filePath) {
  if (!existsSync(filePath)) return false;
  const head = readFileSync(filePath).subarray(0, 40).toString("utf8");
  return head.startsWith("version https://git-lfs.github.com/spec/v1");
}

function isValid(filePath, minBytes) {
  if (!existsSync(filePath) || isLfsPointer(filePath)) return false;
  return statSync(filePath).size >= minBytes;
}

async function download(url, dest) {
  mkdirSync(dirname(join(root, dest)), { recursive: true });
  const tmp = join(root, `${dest}.download`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(res.body, createWriteStream(tmp));
  const got = statSync(tmp).size;
  if (got < 1000 || isLfsPointer(tmp)) {
    throw new Error(`Downloaded file looks invalid (${got} bytes) from ${url}`);
  }
  renameSync(tmp, join(root, dest));
  console.log(`download-assets: ${dest} (${(got / 1024 / 1024).toFixed(1)} MiB)`);
}

for (const asset of ASSETS) {
  const dest = join(root, asset.dest);
  if (isValid(dest, asset.minBytes)) {
    console.log(`download-assets: ${asset.dest} (cached)`);
    continue;
  }
  await download(`${base}/${asset.path}`, asset.dest);
}
