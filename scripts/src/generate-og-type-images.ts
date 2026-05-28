// Generates the six hand-designed per-post-type OG share images for HatchUp.
// Each image is 1200x630, on-brand (dark + neon pink/orange) and visually
// distinctive so a glance at an unfurled link tells you what kind of moment
// it is (hatch / evolution / streak / transformation / workout / gym).
//
// Run:
//   pnpm --filter @workspace/scripts exec tsx src/generate-og-type-images.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, "../../artifacts/hatchup/public");

const W = 1200;
const H = 630;

// ── Shared chrome ────────────────────────────────────────────────────────────
const brandMark = `
  <text x="64" y="92" font-family="Inter, sans-serif" font-weight="800" font-size="40" fill="#ffffff" letter-spacing="3">HATCHUP</text>
  <text x="64" y="124" font-family="Inter, sans-serif" font-weight="400" font-size="18" fill="rgba(255,255,255,0.65)">Fitness Pals · Every step hatches a creature</text>
`;

function pill(label: string, x: number, y: number, fillId: string): string {
  const w = 60 + label.length * 14;
  return `
    <rect x="${x}" y="${y}" rx="28" ry="28" width="${w}" height="48" fill="url(#${fillId})" />
    <text x="${x + w / 2}" y="${y + 32}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="20" fill="#ffffff" letter-spacing="3">${label}</text>
  `;
}

function frame(bgStops: string, extraDefs = ""): { open: string; close: string } {
  return {
    open: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${bgStops}</linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff3d8b"/>
      <stop offset="100%" stop-color="#ff6b3d"/>
    </linearGradient>
    ${extraDefs}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="url(#accent)"/>
  <rect x="0" y="${H - 8}" width="${W}" height="8" fill="url(#accent)"/>`,
    close: `</svg>`,
  };
}

// ── 1. Hatch moment ──────────────────────────────────────────────────────────
function svgHatch(): string {
  const f = frame(
    `<stop offset="0%" stop-color="#1a0a1a"/><stop offset="100%" stop-color="#0a0a14"/>`,
    `<radialGradient id="halo" cx="50%" cy="50%" r="50%">
       <stop offset="0%" stop-color="#fff3a8" stop-opacity="0.9"/>
       <stop offset="60%" stop-color="#ff8a3d" stop-opacity="0.25"/>
       <stop offset="100%" stop-color="#ff3d8b" stop-opacity="0"/>
     </radialGradient>
     <linearGradient id="egg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="#fff1c4"/>
       <stop offset="50%" stop-color="#ffd1a8"/>
       <stop offset="100%" stop-color="#ff8a3d"/>
     </linearGradient>
     <linearGradient id="hatchling" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="#ff6bd1"/>
       <stop offset="100%" stop-color="#ff3d8b"/>
     </linearGradient>`,
  );
  // Halo behind the egg
  const halo = `<circle cx="820" cy="350" r="320" fill="url(#halo)"/>`;
  // Cracked egg: upper half offset and rotated slightly, lower half intact
  // Lower half with jagged top edge
  const lower = `
    <path d="M 700,360
             C 700,460 740,540 820,540
             C 900,540 940,460 940,360
             L 940,360
             L 925,355 L 915,365 L 900,355 L 885,365 L 870,355 L 855,365 L 840,355 L 825,365 L 810,355 L 795,365 L 780,355 L 765,365 L 750,355 L 735,365 L 720,355 L 705,365 Z"
          fill="url(#egg)" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
  `;
  // Upper half flying off
  const upper = `
    <g transform="translate(820,200) rotate(-18)">
      <path d="M -120,160
               C -120,60 -80,-20 0,-20
               C 80,-20 120,60 120,160
               L 105,150 L 95,160 L 80,150 L 65,160 L 50,150 L 35,160 L 20,150 L 5,160 L -10,150 L -25,160 L -40,150 L -55,160 L -70,150 L -85,160 L -100,150 L -115,160 Z"
            fill="url(#egg)" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
    </g>
  `;
  // Tiny hatchling peeking out
  const hatchling = `
    <g transform="translate(820,360)">
      <ellipse cx="0" cy="0" rx="58" ry="50" fill="url(#hatchling)"/>
      <circle cx="-18" cy="-8" r="8" fill="#fff"/>
      <circle cx="18" cy="-8" r="8" fill="#fff"/>
      <circle cx="-18" cy="-8" r="4" fill="#0a0a14"/>
      <circle cx="18" cy="-8" r="4" fill="#0a0a14"/>
      <path d="M -12,12 Q 0,22 12,12" stroke="#0a0a14" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M -55,-30 L -45,-50 L -35,-30 Z" fill="url(#hatchling)"/>
      <path d="M 35,-30 L 45,-50 L 55,-30 Z" fill="url(#hatchling)"/>
    </g>
  `;
  // Sparkles around
  const spark = (x: number, y: number, r: number) =>
    `<g transform="translate(${x},${y})"><path d="M 0,-${r} L ${r * 0.3},-${r * 0.3} L ${r},0 L ${r * 0.3},${r * 0.3} L 0,${r} L -${r * 0.3},${r * 0.3} L -${r},0 L -${r * 0.3},-${r * 0.3} Z" fill="#fff3a8"/></g>`;
  const sparkles = [
    spark(640, 220, 14),
    spark(1000, 240, 18),
    spark(1050, 420, 12),
    spark(620, 460, 10),
    spark(720, 150, 8),
    spark(960, 130, 10),
  ].join("");

  return `${f.open}
    ${brandMark}
    ${halo}
    ${sparkles}
    ${lower}
    ${hatchling}
    ${upper}
    ${pill("HATCH MOMENT", 64, 200, "accent")}
    <text x="64" y="360" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="#ffffff">A new pal</text>
    <text x="64" y="440" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="url(#accent)">just hatched.</text>
    <text x="64" y="500" font-family="Inter, sans-serif" font-weight="500" font-size="24" fill="rgba(255,255,255,0.7)">See who joined the squad on HatchUp.</text>
  ${f.close}`;
}

// ── 2. Evolution reveal ──────────────────────────────────────────────────────
function svgEvolution(): string {
  const f = frame(
    `<stop offset="0%" stop-color="#0a0a2a"/><stop offset="100%" stop-color="#1a0033"/>`,
    `<radialGradient id="burst" cx="50%" cy="50%" r="50%">
       <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.9"/>
       <stop offset="50%" stop-color="#7c3aed" stop-opacity="0.4"/>
       <stop offset="100%" stop-color="#0a0a2a" stop-opacity="0"/>
     </radialGradient>
     <linearGradient id="evoBefore" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="#7c3aed"/>
       <stop offset="100%" stop-color="#3b1d6b"/>
     </linearGradient>
     <linearGradient id="evoAfter" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="#67e8f9"/>
       <stop offset="100%" stop-color="#7c3aed"/>
     </linearGradient>`,
  );
  // Light burst behind
  const burst = `<circle cx="900" cy="340" r="340" fill="url(#burst)"/>`;
  // Sun rays
  const rays = Array.from({ length: 16 })
    .map((_, i) => {
      const angle = (i * 360) / 16;
      return `<g transform="translate(900,340) rotate(${angle})"><rect x="-3" y="-380" width="6" height="180" fill="rgba(167,139,250,0.35)"/></g>`;
    })
    .join("");
  // Before silhouette (small, faded)
  const before = `
    <g transform="translate(700,400)" opacity="0.45">
      <ellipse cx="0" cy="0" rx="42" ry="36" fill="url(#evoBefore)"/>
      <circle cx="-12" cy="-6" r="5" fill="#fff"/>
      <circle cx="12" cy="-6" r="5" fill="#fff"/>
    </g>
  `;
  // Arrow
  const arrow = `
    <g transform="translate(790,400)" fill="#fff" opacity="0.85">
      <path d="M 0,-10 L 30,-10 L 30,-20 L 55,0 L 30,20 L 30,10 L 0,10 Z"/>
    </g>
  `;
  // After (bigger, glowing, with crown spikes)
  const after = `
    <g transform="translate(960,340)">
      <ellipse cx="0" cy="0" rx="90" ry="80" fill="url(#evoAfter)" stroke="#fff" stroke-width="3"/>
      <path d="M -70,-50 L -55,-90 L -40,-50 Z M -25,-65 L -10,-105 L 5,-65 Z M 20,-65 L 35,-105 L 50,-65 Z M 55,-50 L 70,-90 L 85,-50 Z" fill="url(#evoAfter)" stroke="#fff" stroke-width="2"/>
      <circle cx="-25" cy="-12" r="11" fill="#fff"/>
      <circle cx="25" cy="-12" r="11" fill="#fff"/>
      <circle cx="-25" cy="-12" r="6" fill="#0a0a2a"/>
      <circle cx="25" cy="-12" r="6" fill="#0a0a2a"/>
      <path d="M -20,20 Q 0,38 20,20" stroke="#0a0a2a" stroke-width="4" fill="none" stroke-linecap="round"/>
      <!-- wings -->
      <path d="M -90,10 Q -150,-10 -130,50 Q -110,40 -90,30 Z" fill="url(#evoAfter)" opacity="0.85"/>
      <path d="M 90,10 Q 150,-10 130,50 Q 110,40 90,30 Z" fill="url(#evoAfter)" opacity="0.85"/>
    </g>
  `;
  return `${f.open}
    ${brandMark}
    ${burst}
    ${rays}
    ${before}
    ${arrow}
    ${after}
    ${pill("EVOLUTION REVEAL", 64, 200, "accent")}
    <text x="64" y="360" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="#ffffff">Leveled up</text>
    <text x="64" y="440" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="#a78bfa">into something new.</text>
    <text x="64" y="500" font-family="Inter, sans-serif" font-weight="500" font-size="24" fill="rgba(255,255,255,0.7)">A Hatchling just evolved on HatchUp.</text>
  ${f.close}`;
}

// ── 3. Streak milestone ──────────────────────────────────────────────────────
function svgStreak(): string {
  const f = frame(
    `<stop offset="0%" stop-color="#2a0a05"/><stop offset="100%" stop-color="#0a0a0f"/>`,
    `<radialGradient id="emberGlow" cx="50%" cy="60%" r="60%">
       <stop offset="0%" stop-color="#fff3a8" stop-opacity="0.85"/>
       <stop offset="40%" stop-color="#ff6b00" stop-opacity="0.5"/>
       <stop offset="100%" stop-color="#2a0a05" stop-opacity="0"/>
     </radialGradient>
     <linearGradient id="flameOuter" x1="0" y1="1" x2="0" y2="0">
       <stop offset="0%" stop-color="#ff3d3d"/>
       <stop offset="60%" stop-color="#ff8a3d"/>
       <stop offset="100%" stop-color="#ffd84d"/>
     </linearGradient>
     <linearGradient id="flameInner" x1="0" y1="1" x2="0" y2="0">
       <stop offset="0%" stop-color="#ff8a3d"/>
       <stop offset="100%" stop-color="#fff3a8"/>
     </linearGradient>`,
  );
  const glow = `<ellipse cx="900" cy="380" rx="320" ry="280" fill="url(#emberGlow)"/>`;
  // Big flame
  const flame = `
    <g transform="translate(900,340)">
      <path d="M 0,-220
               C 80,-140 140,-80 140,20
               C 140,140 70,200 0,200
               C -70,200 -140,140 -140,20
               C -140,-50 -90,-100 -50,-120
               C -40,-80 -20,-60 0,-60
               C 10,-100 -10,-160 0,-220 Z"
            fill="url(#flameOuter)"/>
      <path d="M 0,-130
               C 50,-70 90,-30 90,40
               C 90,120 40,160 0,160
               C -40,160 -90,120 -90,40
               C -90,-10 -50,-50 -20,-70
               C -10,-40 0,-30 0,-30
               C 5,-60 -5,-100 0,-130 Z"
            fill="url(#flameInner)"/>
      <path d="M 0,-50 C 25,-10 40,20 40,55 C 40,90 20,110 0,110 C -20,110 -40,90 -40,55 C -40,30 -20,5 0,-20 Z" fill="#fff3a8"/>
    </g>
  `;
  // Little embers floating up
  const ember = (x: number, y: number, r: number, o: number) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#ff8a3d" opacity="${o}"/>`;
  const embers = [
    ember(760, 180, 6, 0.8),
    ember(1040, 200, 5, 0.7),
    ember(820, 100, 4, 0.6),
    ember(990, 80, 5, 0.65),
    ember(700, 280, 4, 0.55),
    ember(1080, 320, 4, 0.6),
  ].join("");
  return `${f.open}
    ${brandMark}
    ${glow}
    ${embers}
    ${flame}
    ${pill("STREAK MILESTONE", 64, 200, "accent")}
    <text x="64" y="360" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="#ffffff">On fire.</text>
    <text x="64" y="440" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="url(#flameOuter)">Streak unlocked.</text>
    <text x="64" y="500" font-family="Inter, sans-serif" font-weight="500" font-size="24" fill="rgba(255,255,255,0.7)">Another day, another milestone on HatchUp.</text>
  ${f.close}`;
}

// ── 4. Transformation ────────────────────────────────────────────────────────
function svgTransformation(): string {
  const f = frame(
    `<stop offset="0%" stop-color="#06182a"/><stop offset="100%" stop-color="#1a0a2e"/>`,
    `<radialGradient id="tGlow" cx="50%" cy="50%" r="50%">
       <stop offset="0%" stop-color="#67e8f9" stop-opacity="0.65"/>
       <stop offset="60%" stop-color="#a78bfa" stop-opacity="0.25"/>
       <stop offset="100%" stop-color="#06182a" stop-opacity="0"/>
     </radialGradient>
     <linearGradient id="wingL" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0%" stop-color="#67e8f9"/>
       <stop offset="100%" stop-color="#a78bfa"/>
     </linearGradient>
     <linearGradient id="wingR" x1="1" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="#ff6bd1"/>
       <stop offset="100%" stop-color="#a78bfa"/>
     </linearGradient>`,
  );
  const glow = `<circle cx="900" cy="320" r="340" fill="url(#tGlow)"/>`;
  // Butterfly
  const butterfly = `
    <g transform="translate(900,320)">
      <!-- left upper wing -->
      <path d="M 0,0 C -70,-110 -200,-130 -240,-60 C -210,-30 -150,-20 -70,-10 Z" fill="url(#wingL)" stroke="#fff" stroke-width="2"/>
      <!-- left lower wing -->
      <path d="M 0,10 C -60,40 -180,90 -200,40 C -160,20 -100,20 -50,15 Z" fill="url(#wingL)" stroke="#fff" stroke-width="2" opacity="0.9"/>
      <!-- right upper wing -->
      <path d="M 0,0 C 70,-110 200,-130 240,-60 C 210,-30 150,-20 70,-10 Z" fill="url(#wingR)" stroke="#fff" stroke-width="2"/>
      <!-- right lower wing -->
      <path d="M 0,10 C 60,40 180,90 200,40 C 160,20 100,20 50,15 Z" fill="url(#wingR)" stroke="#fff" stroke-width="2" opacity="0.9"/>
      <!-- wing dots -->
      <circle cx="-130" cy="-60" r="14" fill="rgba(255,255,255,0.6)"/>
      <circle cx="130" cy="-60" r="14" fill="rgba(255,255,255,0.6)"/>
      <circle cx="-120" cy="40" r="9" fill="rgba(255,255,255,0.55)"/>
      <circle cx="120" cy="40" r="9" fill="rgba(255,255,255,0.55)"/>
      <!-- body -->
      <ellipse cx="0" cy="0" rx="12" ry="50" fill="#1a0a2e" stroke="#fff" stroke-width="2"/>
      <circle cx="0" cy="-50" r="14" fill="#1a0a2e" stroke="#fff" stroke-width="2"/>
      <!-- antennae -->
      <path d="M -6,-58 Q -22,-90 -30,-100" stroke="#fff" stroke-width="2" fill="none"/>
      <path d="M 6,-58 Q 22,-90 30,-100" stroke="#fff" stroke-width="2" fill="none"/>
      <circle cx="-30" cy="-100" r="4" fill="#fff"/>
      <circle cx="30" cy="-100" r="4" fill="#fff"/>
    </g>
  `;
  // Tiny chrysalis fading on the left
  const before = `
    <g transform="translate(720,460)" opacity="0.55">
      <ellipse cx="0" cy="0" rx="22" ry="44" fill="#67e8f9" stroke="#fff" stroke-width="2"/>
      <path d="M -22,-20 Q 0,-10 22,-20 M -22,0 Q 0,10 22,0 M -22,20 Q 0,30 22,20" stroke="rgba(255,255,255,0.5)" fill="none"/>
    </g>
  `;
  return `${f.open}
    ${brandMark}
    ${glow}
    ${before}
    ${butterfly}
    ${pill("TRANSFORMATION", 64, 200, "accent")}
    <text x="64" y="360" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="#ffffff">Before and after</text>
    <text x="64" y="440" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="#67e8f9">are not the same.</text>
    <text x="64" y="500" font-family="Inter, sans-serif" font-weight="500" font-size="24" fill="rgba(255,255,255,0.7)">A real transformation on HatchUp.</text>
  ${f.close}`;
}

// ── 5. Workout stat ──────────────────────────────────────────────────────────
function svgWorkout(): string {
  const f = frame(
    `<stop offset="0%" stop-color="#02141a"/><stop offset="100%" stop-color="#0a1a2a"/>`,
    `<linearGradient id="bar1" x1="0" y1="1" x2="0" y2="0">
       <stop offset="0%" stop-color="#0ea5e9"/>
       <stop offset="100%" stop-color="#67e8f9"/>
     </linearGradient>
     <linearGradient id="bar2" x1="0" y1="1" x2="0" y2="0">
       <stop offset="0%" stop-color="#10b981"/>
       <stop offset="100%" stop-color="#6ee7b7"/>
     </linearGradient>
     <linearGradient id="bar3" x1="0" y1="1" x2="0" y2="0">
       <stop offset="0%" stop-color="#ff3d8b"/>
       <stop offset="100%" stop-color="#ff8a3d"/>
     </linearGradient>`,
  );
  // Grid background
  const grid = Array.from({ length: 5 })
    .map((_, i) => `<line x1="640" y1="${200 + i * 80}" x2="1140" y2="${200 + i * 80}" stroke="rgba(255,255,255,0.07)" stroke-width="2"/>`)
    .join("");
  // Bars
  const bars = `
    <rect x="680" y="380" width="70" height="200" fill="url(#bar1)" rx="6"/>
    <rect x="790" y="280" width="70" height="300" fill="url(#bar2)" rx="6"/>
    <rect x="900" y="220" width="70" height="360" fill="url(#bar3)" rx="6"/>
    <rect x="1010" y="180" width="70" height="400" fill="url(#bar3)" rx="6"/>
  `;
  // Trend line over bars
  const trend = `
    <polyline points="715,400 825,320 935,240 1045,200" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="715" cy="400" r="8" fill="#fff"/>
    <circle cx="825" cy="320" r="8" fill="#fff"/>
    <circle cx="935" cy="240" r="8" fill="#fff"/>
    <circle cx="1045" cy="200" r="10" fill="#ff8a3d" stroke="#fff" stroke-width="3"/>
  `;
  // Running figure on the left
  const runner = `
    <g transform="translate(150,420)" fill="#ff6b3d" stroke="#fff" stroke-width="2" stroke-linejoin="round">
      <circle cx="0" cy="-110" r="20"/>
      <path d="M -10,-95 L 25,-50 L 18,0 L 35,40 L 25,55 L 5,15 L -15,30 L -35,75 L -50,72 L -28,15 L -22,-30 L -38,-55 L -55,-35 L -65,-45 L -40,-75 Z"/>
    </g>
  `;
  // Step icon row
  const steps = `
    <g transform="translate(60,560)" fill="rgba(255,255,255,0.25)">
      <path d="M 0,0 q 12,-20 26,-18 q 14,2 8,22 z"/>
      <path d="M 40,-10 q 12,-20 26,-18 q 14,2 8,22 z"/>
      <path d="M 80,0 q 12,-20 26,-18 q 14,2 8,22 z"/>
    </g>
  `;
  return `${f.open}
    ${brandMark}
    ${grid}
    ${bars}
    ${trend}
    ${runner}
    ${steps}
    ${pill("WORKOUT STAT", 64, 200, "accent")}
    <text x="64" y="360" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="#ffffff">Numbers</text>
    <text x="64" y="440" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="#67e8f9">don't lie.</text>
  ${f.close}`;
}

// ── 6. Gym selfie ────────────────────────────────────────────────────────────
function svgGym(): string {
  const f = frame(
    `<stop offset="0%" stop-color="#1a0606"/><stop offset="100%" stop-color="#0a0a0f"/>`,
    `<radialGradient id="spotlight" cx="50%" cy="40%" r="55%">
       <stop offset="0%" stop-color="rgba(255,107,61,0.4)"/>
       <stop offset="100%" stop-color="rgba(10,10,15,0)"/>
     </radialGradient>
     <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="#e5e7eb"/>
       <stop offset="50%" stop-color="#9ca3af"/>
       <stop offset="100%" stop-color="#4b5563"/>
     </linearGradient>
     <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="#1f2937"/>
       <stop offset="100%" stop-color="#0a0a0f"/>
     </linearGradient>
     <linearGradient id="bicep" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="#ffb088"/>
       <stop offset="100%" stop-color="#ff6b3d"/>
     </linearGradient>`,
  );
  const spot = `<ellipse cx="900" cy="260" rx="380" ry="280" fill="url(#spotlight)"/>`;
  // Bicep flex on the right
  const bicep = `
    <g transform="translate(900,360)" stroke="#fff" stroke-width="3" stroke-linejoin="round">
      <!-- upper arm -->
      <path d="M -160,80 Q -180,-40 -60,-70 Q 40,-60 60,40 Q 50,90 -10,100 Q -100,110 -160,80 Z" fill="url(#bicep)"/>
      <!-- bicep bump highlight -->
      <path d="M -90,-30 Q -50,-80 0,-50 Q 20,-10 -20,10 Q -70,10 -90,-30 Z" fill="#ffd1a8" opacity="0.6" stroke="none"/>
      <!-- forearm going up -->
      <path d="M 40,40 Q 110,-60 130,-180 Q 100,-200 70,-160 Q 30,-60 -10,40 Z" fill="url(#bicep)"/>
      <!-- fist -->
      <circle cx="110" cy="-190" r="32" fill="url(#bicep)"/>
      <path d="M 95,-215 q 8,-6 14,0 m 6,2 q 8,-6 14,0 m 6,4 q 8,-6 14,0" stroke="#fff" stroke-width="2" fill="none"/>
    </g>
  `;
  // Small dumbbell badge in the top-right corner
  const dumbbell = `
    <g transform="translate(1080,180) rotate(-15)" stroke="#fff" stroke-width="2" stroke-linejoin="round">
      <rect x="-22" y="-12" width="44" height="24" fill="url(#metal)" rx="4"/>
      <rect x="-66" y="-30" width="40" height="60" fill="url(#plate)" rx="6"/>
      <rect x="26" y="-30" width="40" height="60" fill="url(#plate)" rx="6"/>
      <rect x="-78" y="-38" width="14" height="76" fill="url(#metal)" rx="3"/>
      <rect x="64" y="-38" width="14" height="76" fill="url(#metal)" rx="3"/>
    </g>
  `;
  // Sweat drops
  const drop = (x: number, y: number, r: number) =>
    `<path d="M ${x},${y - r * 1.5} Q ${x + r},${y - r * 0.2} ${x + r},${y + r * 0.4} Q ${x},${y + r * 1.4} ${x - r},${y + r * 0.4} Q ${x - r},${y - r * 0.2} ${x},${y - r * 1.5} Z" fill="#67e8f9" opacity="0.85" stroke="#fff" stroke-width="1.5"/>`;
  const drops = [drop(820, 160, 8), drop(1060, 180, 10), drop(780, 540, 9)].join("");
  return `${f.open}
    ${brandMark}
    ${spot}
    ${dumbbell}
    ${bicep}
    ${drops}
    ${pill("GYM SELFIE", 64, 200, "accent")}
    <text x="64" y="360" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="#ffffff">Reps in,</text>
    <text x="64" y="440" font-family="Inter, sans-serif" font-weight="800" font-size="80" fill="url(#accent)">selfie out.</text>
    <text x="64" y="500" font-family="Inter, sans-serif" font-weight="500" font-size="24" fill="rgba(255,255,255,0.7)">Caught a moment on HatchUp.</text>
  ${f.close}`;
}

// ── Rasterize & write ────────────────────────────────────────────────────────
const outputs: Array<{ file: string; svg: string }> = [
  { file: "opengraph-hatch.png", svg: svgHatch() },
  { file: "opengraph-evolution.png", svg: svgEvolution() },
  { file: "opengraph-streak.png", svg: svgStreak() },
  { file: "opengraph-transformation.png", svg: svgTransformation() },
  { file: "opengraph-workout.png", svg: svgWorkout() },
  { file: "opengraph-gym.png", svg: svgGym() },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, svg } of outputs) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: W } });
  const png = resvg.render().asPng();
  const dest = join(OUT_DIR, file);
  writeFileSync(dest, png);
  console.log(`wrote ${dest} (${png.length} bytes)`);
}
