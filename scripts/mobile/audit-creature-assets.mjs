import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../artifacts/mobile/assets/creatures", import.meta.url);
const PNG_COLOR_TYPES = {
  0: "grayscale",
  2: "rgb-no-alpha",
  3: "indexed",
  4: "grayscale-alpha",
  6: "rgba-alpha",
};

const files = walk(root.pathname).filter((file) => file.endsWith(".png"));
const rows = files.map((file) => {
  const buffer = readFileSync(file);
  const colorType = buffer[25];
  const alpha = colorType === 4 || colorType === 6;

  return {
    alpha,
    colorType: PNG_COLOR_TYPES[colorType] ?? `unknown-${colorType}`,
    file: file.replace(root.pathname, "").replace(/^\//, ""),
  };
});

console.log("HatchUp creature asset audit");
for (const row of rows) {
  console.log(`${row.alpha ? "OK " : "WARN"} ${row.file} (${row.colorType})`);
}

const missingAlpha = rows.filter((row) => !row.alpha);
if (missingAlpha.length > 0) {
  console.log(
    `\n${missingAlpha.length} PNG asset(s) do not include alpha transparency.`,
  );
  process.exitCode = 1;
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    return statSync(fullPath).isDirectory() ? walk(fullPath) : fullPath;
  });
}
