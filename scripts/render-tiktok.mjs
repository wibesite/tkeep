import { readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cardsDirectory = join(root, "public", "tiktok");
const font = await readFile(join(root, "public", "assets", "manrope.ttf"));
const embeddedFont = `data:font/ttf;base64,${font.toString("base64")}`;
const cards = ["card1-landing", "card2-bot", "card3-ai", "card4-shop", "card5-support"];

for (const card of cards) {
  const source = await readFile(join(cardsDirectory, `${card}.svg`), "utf8");
  const renderable = source.replace("../assets/manrope.ttf", embeddedFont);
  const temporary = join(cardsDirectory, `${card}.rendering.png`);
  const destination = join(cardsDirectory, `${card}.png`);

  await sharp(Buffer.from(renderable), { density: 96, limitInputPixels: false })
    .resize(1080, 1920, { fit: "fill" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(temporary);
  await rename(temporary, destination);
  console.log(`rendered ${card}.png (1080×1920)`);
}
