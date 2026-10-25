import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const distDirectory = resolve("dist");
const initialAssetBudgetBytes = 1 * 1024 * 1024;

async function directorySize(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sizes = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return directorySize(path);
    return (await stat(path)).size;
  }));
  return sizes.reduce((total, size) => total + size, 0);
}

const bytes = await directorySize(distDirectory);
const kilobytes = (bytes / 1024).toFixed(1);
const budgetKilobytes = initialAssetBudgetBytes / 1024;
console.log(`Production bundle: ${kilobytes} KB (guardrail: ${budgetKilobytes} KB).`);

if (bytes > initialAssetBudgetBytes) {
  throw new Error("Production bundle exceeds the temporary 1 MB low-storage guardrail. Review added assets before merging.");
}
