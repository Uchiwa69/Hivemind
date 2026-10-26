// HM-25 : dessine l'icône Hivemind (4 pastilles, une par IA, sur fond indigo) au format .ico.
// Sans dépendance : chaque taille est une image BMP 32 bits (avec alpha) anticrénelée par suréchantillonnage.
const fs = require('fs');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const BACKGROUND = [0x4f, 0x46, 0xe5];
// Mêmes couleurs que --cli-claude, --cli-agy, --cli-codex, --cli-gemini.
const DOTS = [
  { x: 11, y: 11, color: [0xd9, 0x77, 0x57] },
  { x: 21, y: 11, color: [0x3b, 0x82, 0xf6] },
  { x: 11, y: 21, color: [0x10, 0xa3, 0x7f] },
  { x: 21, y: 21, color: [0xd6, 0x33, 0x6c] },
];
const RADIUS = 4.6;
const CORNER = 7;
const SUPERSAMPLE = 4;

// Coordonnées dans un carré de 32 unités, comme le favicon SVG de la page.
function insideRoundedSquare(x, y) {
  const cx = Math.min(Math.max(x, CORNER), 32 - CORNER);
  const cy = Math.min(Math.max(y, CORNER), 32 - CORNER);
  return (x - cx) ** 2 + (y - cy) ** 2 <= CORNER ** 2;
}

function sample(x, y) {
  if (!insideRoundedSquare(x, y)) return null;
  const dot = DOTS.find((d) => (x - d.x) ** 2 + (y - d.y) ** 2 <= RADIUS ** 2);
  return dot ? dot.color : BACKGROUND;
}

// Pixels BGRA, de bas en haut comme l'attend le format BMP.
function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const n = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0; let g = 0; let b = 0; let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const color = sample(((px + (sx + 0.5) / SUPERSAMPLE) / size) * 32, ((py + (sy + 0.5) / SUPERSAMPLE) / size) * 32);
          if (!color) continue;
          r += color[0]; g += color[1]; b += color[2]; covered += 1;
        }
      }
      const offset = ((size - 1 - py) * size + px) * 4;
      if (covered) {
        pixels[offset] = Math.round(b / covered);
        pixels[offset + 1] = Math.round(g / covered);
        pixels[offset + 2] = Math.round(r / covered);
      }
      pixels[offset + 3] = Math.round((covered / n) * 255);
    }
  }
  return pixels;
}

function bmpEntry(size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // image + masque
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = render(size);
  const maskRow = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRow * size); // transparence portée par l'alpha
  header.writeUInt32LE(pixels.length + mask.length, 20);
  return Buffer.concat([header, pixels, mask]);
}

function makeIco() {
  const images = SIZES.map(bmpEntry);
  const dir = Buffer.alloc(6 + 16 * SIZES.length);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(SIZES.length, 4);
  let offset = dir.length;
  SIZES.forEach((size, i) => {
    const at = 6 + 16 * i;
    dir.writeUInt8(size >= 256 ? 0 : size, at);
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1);
    dir.writeUInt16LE(1, at + 4);
    dir.writeUInt16LE(32, at + 6);
    dir.writeUInt32LE(images[i].length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });
  return Buffer.concat([dir, ...images]);
}

if (require.main === module) {
  const out = process.argv[2] || 'hivemind.ico';
  fs.writeFileSync(out, makeIco());
  console.log(`Icône écrite : ${out}`);
}

module.exports = { makeIco };
