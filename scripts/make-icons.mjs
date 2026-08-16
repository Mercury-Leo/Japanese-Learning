/* Generates the PWA icons into public/. Run once (`npm run icons`) and commit the
   output — this exists so the icons are reproducible and tweakable, not because
   the build needs it. No image dependency: a PNG is a zlib stream plus CRCs, and
   言 is only rectangles, so both fit in this file. */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const INK = [0x16, 0x1b, 0x19];
const GROUND = [0xe6, 0xe9, 0xe3];
const STEM = [0xb8, 0x34, 0x2a];

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, sum]);
};

/** 8-bit truecolour PNG from a size*size*3 pixel buffer. */
function encodePng(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const stride = size * 3;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* 言 in unit coordinates. Everything sits inside 0.22–0.78, which is the square
   inscribed in the maskable safe circle, so Android can crop to any shape. */
const STROKES = [
  [0.28, 0.220, 0.72, 0.265, STEM],   // 亠 lid
  [0.34, 0.330, 0.66, 0.375, GROUND],
  [0.34, 0.415, 0.66, 0.460, GROUND],
  [0.34, 0.500, 0.66, 0.545, GROUND],
  [0.36, 0.600, 0.64, 0.780, GROUND], // 口
  [0.405, 0.645, 0.595, 0.735, INK],  // 口 counter
];

function draw(size) {
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) px.set(INK, i * 3);
  for (const [x0, y0, x1, y1, color] of STROKES) {
    for (let y = Math.round(y0 * size); y < Math.round(y1 * size); y++) {
      for (let x = Math.round(x0 * size); x < Math.round(x1 * size); x++) {
        px.set(color, (y * size + x) * 3);
      }
    }
  }
  return encodePng(size, px);
}

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  const out = new URL("../public/" + name, import.meta.url);
  writeFileSync(out, draw(size));
  console.log("wrote public/" + name);
}
