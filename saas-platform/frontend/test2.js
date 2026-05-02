const margin = 10;
const kerf = 5;
const sw = 2500;
const sh = 1250;
const sheet = [
  { x: 10, y: 10, w: 400, h: 600, rotated: false }
];
const idx = 0;
const tx = 500; // moving to right
const ty = 10;
const nw = 400;
const nh = 600;

// Check bounds
if (tx < margin - 0.1 || ty < margin - 0.1 || tx + nw > sw - margin + 0.1 || ty + nh > sh - margin + 0.1) {
  console.log("Bounds failed");
}

// Check collisions
for (let oi = 0; oi < sheet.length; oi++) {
  if (oi === idx) continue;
  const other = sheet[oi];
  const ow = other.rotated ? other.h : other.w;
  const oh = other.rotated ? other.w : other.h;
  if (tx < other.x + ow + kerf - 0.1 && tx + nw + kerf > other.x + 0.1 &&
      ty < other.y + oh + kerf - 0.1 && ty + nh + kerf > other.y + 0.1) {
    console.log("Collision failed");
  }
}
console.log("Success!");
