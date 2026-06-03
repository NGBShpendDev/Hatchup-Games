import { createReadStream, createWriteStream, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../artifacts/mobile/package.json", import.meta.url),
);
const { PNG } = require("pngjs");

const root = new URL("../../artifacts/mobile/assets/creatures", import.meta.url);
const files = walk(root.pathname).filter((file) => file.endsWith(".png"));

let totalCleared = 0;

for (const file of files) {
  const png = await readPng(file);
  const cleared = clearEdgeConnectedBackground(png);
  totalCleared += cleared;
  await writePng(file, png);
  console.log(
    `Cleaned ${file.replace(root.pathname, "").replace(/^\//, "")}: ${cleared} background pixels`,
  );
}

console.log(`\nConverted ${files.length} creature PNG(s) to RGBA.`);
console.log(`Cleared ${totalCleared} edge-connected background pixels.`);

function clearEdgeConnectedBackground(png) {
  const visited = new Uint8Array(png.width * png.height);
  const queue = [];
  let cleared = 0;

  for (let x = 0; x < png.width; x += 1) {
    pushIfBackground(png, visited, queue, x, 0);
    pushIfBackground(png, visited, queue, x, png.height - 1);
  }

  for (let y = 0; y < png.height; y += 1) {
    pushIfBackground(png, visited, queue, 0, y);
    pushIfBackground(png, visited, queue, png.width - 1, y);
  }

  while (queue.length > 0) {
    const index = queue.pop();
    const x = index % png.width;
    const y = Math.floor(index / png.width);
    const offset = index * 4;

    png.data[offset + 3] = 0;
    cleared += 1;

    pushIfBackground(png, visited, queue, x + 1, y);
    pushIfBackground(png, visited, queue, x - 1, y);
    pushIfBackground(png, visited, queue, x, y + 1);
    pushIfBackground(png, visited, queue, x, y - 1);
  }

  return cleared;
}

function pushIfBackground(png, visited, queue, x, y) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;

  const index = y * png.width + x;
  if (visited[index]) return;
  visited[index] = 1;

  if (isBackgroundPixel(png, index * 4)) queue.push(index);
}

function isBackgroundPixel(png, offset) {
  const red = png.data[offset];
  const green = png.data[offset + 1];
  const blue = png.data[offset + 2];
  const alpha = png.data[offset + 3];
  if (alpha === 0) return false;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const average = (red + green + blue) / 3;
  const saturation = max - min;

  return average >= 220 && saturation <= 36;
}

function readPng(file) {
  return new Promise((resolve, reject) => {
    createReadStream(file)
      .pipe(new PNG())
      .on("parsed", function parsed() {
        resolve(this);
      })
      .on("error", reject);
  });
}

function writePng(file, png) {
  return new Promise((resolve, reject) => {
    png
      .pack()
      .pipe(createWriteStream(file))
      .on("finish", resolve)
      .on("error", reject);
  });
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    return statSync(fullPath).isDirectory() ? walk(fullPath) : fullPath;
  });
}
