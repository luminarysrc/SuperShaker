// simulate the drop
const margin = 10;
const kerf = 5;
const sw = 2500;
const sh = 1250;
const tx = 10;
const ty = 10;
const nw = 400;
const nh = 600;

console.log("Bounds test:", tx < margin - 0.1 || ty < margin - 0.1 || tx + nw > sw - margin + 0.1 || ty + nh > sh - margin + 0.1);
