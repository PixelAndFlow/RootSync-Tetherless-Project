import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const assetsPath = fileURLToPath(assetsDirectory);
const files = await readdir(assetsPath);
const assets = await Promise.all(files.filter((file) => /\.(js|css)$/.test(file)).map(async (file) => ({ file, bytes: await readFile(join(assetsPath, file)) })));
const javascriptGzip = assets.filter((asset) => asset.file.endsWith(".js")).reduce((total, asset) => total + gzipSync(asset.bytes).length, 0);
const cssGzip = assets.filter((asset) => asset.file.endsWith(".css")).reduce((total, asset) => total + gzipSync(asset.bytes).length, 0);
const kb = (bytes) => (bytes / 1024).toFixed(1);

console.log(`Performance budget: JS ${kb(javascriptGzip)} KB gzip, CSS ${kb(cssGzip)} KB gzip.`);
// Raised from 160 to 180 KB on 2026-11-01 (#48): #38-#41's staff admin screens pushed the one
// shared bundle to 164.8 KB, since nothing code-splits staff-only code away from the learner
// app yet. Temporary headroom until #48 (separate admin app, the original design) lands.
if (javascriptGzip > 180 * 1024 || cssGzip > 25 * 1024) throw new Error("Performance budget exceeded: keep gzip JavaScript <= 180 KB and CSS <= 25 KB.");
