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
if (javascriptGzip > 160 * 1024 || cssGzip > 25 * 1024) throw new Error("Performance budget exceeded: keep gzip JavaScript <= 160 KB and CSS <= 25 KB.");
