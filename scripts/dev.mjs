// Cross-platform dev runner: fetch assets once, then run the worker bundler in watch mode
// alongside `next dev`, and shut both down together.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => spawn(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
const once = (cmd, args) =>
  new Promise((resolve, reject) => run(cmd, args).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited with ${code}`)))));

await once(process.execPath, ["scripts/download-assets.mjs"]);
const children = [run(process.execPath, ["scripts/build-assets.mjs", "--watch"]), run("next", ["dev", ...process.argv.slice(2)])];

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  process.exitCode = code;
};
for (const c of children) c.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
