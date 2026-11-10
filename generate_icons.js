import fs from 'fs';
import zlib from 'zlib';

// Zero-dependency high-precision PNG generator for the Liquid-Glass Turquoise/Emerald App Icon
// Renders 512x512, 192x192, 180x180 (apple-touch-icon), and 32x32 (favicon)

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter type None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function clamp(v, min = 0, max = 1) {
  return v < min ? min : (v > max ? max : v);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sdRoundedBox(px, py, cx, cy, bw, bh, r) {
  const qx = Math.abs(px - cx) - bw + r;
  const qy = Math.abs(py - cy) - bh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToPolygonEdge(px, py, poly) {
  let minD = 1e9;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = sdSegment(px, py, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    if (d < minD) minD = d;
  }
  return minD;
}

// Lightning bolt polygon in normalized [0..1024] coordinates
const BOLT_POLY = [
  [566, 156],
  [348, 518],
  [498, 518],
  [446, 856],
  [692, 468],
  [534, 468]
];

// Perspective solar panel polygon in normalized [0..1024] coordinates
const PANEL_POLY = [
  [244, 256],
  [780, 256],
  [874, 776],
  [150, 776]
];

function evalWaveY(nx) {
  // Smooth glowing intraday solar curve across [150..874]
  const t = clamp((nx - 150) / 724, 0, 1);
  return 640 - 210 * Math.sin(t * Math.PI * 0.88) - 58 * Math.sin(t * Math.PI * 2.6);
}

function sampleIconPixel(nx, ny) {
  // 1. Outer Squircle mask
  const dSquircle = sdRoundedBox(nx, ny, 512, 512, 496, 496, 224);
  if (dSquircle > 2) return [0, 0, 0, 0];
  const alphaSquircle = 1 - smoothstep(-1.5, 1.5, dSquircle);

  // Base Liquid-Glass Emerald/Teal radial background
  const distCenter = Math.hypot(nx - 490, ny - 330) / 760;
  let r = lerp(15, 2, clamp(distCenter, 0, 1));
  let g = lerp(118, 24, clamp(distCenter, 0, 1));
  let b = lerp(110, 28, clamp(distCenter, 0, 1));

  // Ambient emerald aura around center
  const dAura = Math.hypot(nx - 512, ny - 520) / 410;
  if (dAura < 1) {
    const k = Math.pow(1 - dAura, 2) * 0.42;
    r = lerp(r, 45, k);
    g = lerp(g, 212, k);
    b = lerp(b, 191, k);
  }

  // Top glass specular crown reflection
  if (ny < 430) {
    const crownY = 390 - Math.pow((nx - 512) / 470, 2) * 110;
    if (ny < crownY) {
      const sheen = (1 - ny / 430) * 0.24;
      r = lerp(r, 240, sheen);
      g = lerp(g, 253, sheen);
      b = lerp(b, 250, sheen);
    }
  }

  // 2. Perspective Solar Panel
  const inPanel = pointInPolygon(nx, ny, PANEL_POLY);
  const dPanelEdge = distToPolygonEdge(nx, ny, PANEL_POLY);
  if (inPanel) {
    const pyNorm = clamp((ny - 256) / 520, 0, 1);
    const pr = lerp(17, 4, pyNorm);
    const pg = lerp(94, 47, pyNorm);
    const pb = lerp(89, 46, pyNorm);
    r = lerp(r, pr, 0.88);
    g = lerp(g, pg, 0.88);
    b = lerp(b, pb, 0.88);

    // Solar cell grid lines (3x3 perspective grid)
    const dH1 = Math.abs(ny - 422);
    const dH2 = Math.abs(ny - 590);
    const xLeft1 = lerp(430, 396, pyNorm);
    const xRight1 = lerp(594, 628, pyNorm);
    const dV1 = Math.abs(nx - xLeft1);
    const dV2 = Math.abs(nx - xRight1);
    const minGridD = Math.min(dH1, dH2, dV1, dV2);
    if (minGridD < 4.5) {
      const gk = (1 - minGridD / 4.5) * 0.42;
      r = lerp(r, 153, gk);
      g = lerp(g, 246, gk);
      b = lerp(b, 228, gk);
    }
  }
  if (dPanelEdge < 6) {
    const rk = (1 - dPanelEdge / 6) * 0.78;
    r = lerp(r, 94, rk);
    g = lerp(g, 234, rk);
    b = lerp(b, 212, rk);
  }

  // 3. Luminous Turquoise/Emerald Energy Wave
  if (nx >= 146 && nx <= 878) {
    const wy = evalWaveY(nx);
    // Area glow below wave inside panel
    if (inPanel && ny > wy && ny < 776) {
      const fillT = clamp(1 - (ny - wy) / 300, 0, 1) * 0.45;
      r = lerp(r, 45, fillT);
      g = lerp(g, 212, fillT);
      b = lerp(b, 191, fillT);
    }
    const dWave = Math.abs(ny - wy);
    if (dWave < 28) {
      const glow = Math.pow(1 - dWave / 28, 2) * 0.7;
      r = lerp(r, 52, glow);
      g = lerp(g, 211, glow);
      b = lerp(b, 153, glow);
    }
    if (dWave < 9) {
      const core = 1 - smoothstep(3, 9, dWave);
      r = lerp(r, 236, core);
      g = lerp(g, 253, core);
      b = lerp(b, 245, core);
    }
  }

  // 4. Sun/Energy Halo Node at Top Right (764, 218)
  const dSun = Math.hypot(nx - 764, ny - 218);
  if (dSun < 52) {
    const sg = Math.pow(1 - dSun / 52, 2) * 0.55;
    r = lerp(r, 253, sg);
    g = lerp(g, 224, sg);
    b = lerp(b, 71, sg);
  }
  if (dSun < 24) {
    const sc = 1 - smoothstep(19, 24, dSun);
    r = lerp(r, 254, sc);
    g = lerp(g, 249, sc);
    b = lerp(b, 195, sc);
  }

  // 5. Central Lightning Bolt
  const inBolt = pointInPolygon(nx, ny, BOLT_POLY);
  const dBoltEdge = distToPolygonEdge(nx, ny, BOLT_POLY);
  if (!inBolt && dBoltEdge < 28) {
    const bglow = Math.pow(1 - dBoltEdge / 28, 2) * 0.65;
    r = lerp(r, 45, bglow);
    g = lerp(g, 212, bglow);
    b = lerp(b, 191, bglow);
  }
  if (inBolt) {
    const byNorm = clamp((ny - 156) / 700, 0, 1);
    const br = lerp(255, 110, byNorm);
    const bg = lerp(255, 231, byNorm);
    const bb = lerp(255, 183, byNorm);
    r = br;
    g = bg;
    b = bb;
    if (dBoltEdge < 7) {
      const rimT = 1 - dBoltEdge / 7;
      r = lerp(r, 254, rimT * 0.7);
      g = lerp(g, 240, rimT * 0.7);
      b = lerp(b, 138, rimT * 0.7);
    }
  }

  // 6. Outer Squircle Glass Rim Highlight
  const dRim = Math.abs(dSquircle + 24);
  if (dRim < 7) {
    const rk = (1 - dRim / 7) * 0.82;
    r = lerp(r, 153, rk);
    g = lerp(g, 246, rk);
    b = lerp(b, 228, rk);
  }

  return [
    Math.round(clamp(r, 0, 255)),
    Math.round(clamp(g, 0, 255)),
    Math.round(clamp(b, 0, 255)),
    Math.round(clamp(alphaSquircle * 255, 0, 255))
  ];
}

function renderIconPng(size, filename) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 1024 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 2x2 supersampling for crisp anti-aliased edges
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let sy = 0.25; sy <= 0.75; sy += 0.5) {
        for (let sx = 0.25; sx <= 0.75; sx += 0.5) {
          const [r, g, b, a] = sampleIconPixel((x + sx) * scale, (y + sy) * scale);
          rSum += r;
          gSum += g;
          bSum += b;
          aSum += a;
        }
      }
      const idx = (y * size + x) * 4;
      rgba[idx] = rSum >> 2;
      rgba[idx + 1] = gSum >> 2;
      rgba[idx + 2] = bSum >> 2;
      rgba[idx + 3] = aSum >> 2;
    }
  }
  fs.writeFileSync(filename, encodePNG(size, size, rgba));
  console.log(`Generated ${filename} (${size}x${size})`);
}

renderIconPng(512, 'icon-512.png');
renderIconPng(192, 'icon-192.png');
renderIconPng(180, 'apple-touch-icon.png');
renderIconPng(32, 'favicon-32.png');
