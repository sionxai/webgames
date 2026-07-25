import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const brandDir = path.join(root, "public", "brand");
const symbolPath = path.join(brandDir, "symbol.svg");
const bg = "#0F1220";
const primary = "#FFD60A";

await mkdir(brandDir, { recursive: true });

const symbolSvg = await readFile(symbolPath);

async function renderSymbol(size) {
  return sharp(symbolSvg).resize(size, size).png().toBuffer();
}

await sharp(symbolSvg)
  .resize(512, 512)
  .flatten({ background: bg })
  .png()
  .toFile(path.join(brandDir, "symbol-512.png"));

const appleSymbol = await renderSymbol(126);
await sharp({
  create: {
    width: 180,
    height: 180,
    channels: 4,
    background: bg,
  },
})
  .composite([{ input: appleSymbol, left: 27, top: 27 }])
  .png()
  .toFile(path.join(root, "public", "apple-icon.png"));

const ogSymbol = await renderSymbol(188);
const bottomBar = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="8"><rect width="1200" height="8" fill="${primary}"/></svg>`
);

await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 4,
    background: bg,
  },
})
  .composite([
    { input: ogSymbol, left: 506, top: 128 },
    { input: bottomBar, left: 0, top: 622 },
  ])
  .png()
  .toFile(path.join(root, "public", "og-default.png"));
