/**
 * GenerativeCreature — procedural RPG creature art.
 *
 * 4 body archetypes (one per battle realm):
 *   puffball  (balance)  — round & cute, big expressive eyes, small features
 *   titan     (strength) — broad muscular body, heavy horns, armored plating
 *   phantom   (cardio)   — sleek elongated body, swept wings, flowing fins
 *   feral     (beast)    — hunched predator, spines, fangs, branching tail
 *
 * Each archetype has 3 SVG variants seeded from the creature ID.
 * Features (horns, wings, tail type, armor) are driven by realm + rarity + seed.
 * An animated breathing loop scales the whole creature very subtly.
 */

import React, { useEffect, useRef, useMemo } from "react";
import { Animated, View } from "react-native";
import Svg, {
  Circle, Ellipse, Path, G, Defs,
  RadialGradient, LinearGradient, Stop, ClipPath,
} from "react-native-svg";
import { generateCreatureDna, type CreatureDna } from "@/lib/generative/creatureDna";

export interface CreatureLike {
  id:       number;
  realm?:   string | null;
  rarity?:  string | null;
  isShiny?: boolean | null;
  genetics?: { realm?: string } | null;
}

interface Props {
  creature: CreatureLike;
  size?:    number;
}

const VB = 120;   // viewBox dimension (square)

// ── Eye renderer ──────────────────────────────────────────────────────────────
function Eye({ cx, cy, r, dna }: { cx: number; cy: number; r: number; dna: CreatureDna }) {
  const { eyeConfig } = dna;
  const pr = r * eyeConfig.pupilSize;

  const makeEyePath = () => {
    switch (eyeConfig.shape) {
      case "slant":
        return `M${cx - r},${cy + r * 0.25} Q${cx},${cy - r * 0.8} ${cx + r},${cy - r * 0.25} Q${cx},${cy + r * 0.8} ${cx - r},${cy + r * 0.25}`;
      case "wide":
        return `M${cx - r * 1.2},${cy} Q${cx},${cy - r} ${cx + r * 1.2},${cy} Q${cx},${cy + r * 0.6} ${cx - r * 1.2},${cy}`;
      case "narrow":
        return `M${cx - r * 0.9},${cy + r * 0.3} Q${cx},${cy - r * 0.6} ${cx + r * 0.9},${cy + r * 0.3} Q${cx},${cy + r * 1.0} ${cx - r * 0.9},${cy + r * 0.3}`;
      default:
        return undefined; // use circle
    }
  };

  const eyePath = makeEyePath();

  return (
    <G>
      {/* Sclera */}
      {eyePath
        ? <Path d={eyePath} fill="white" />
        : <Circle cx={cx} cy={cy} r={r} fill="white" />
      }

      {/* Glow ring (rare+) */}
      {eyeConfig.glow && (
        eyePath
          ? <Path d={eyePath} fill="none" stroke={eyeConfig.color} strokeWidth={0.7} strokeOpacity={0.8} />
          : <Circle cx={cx} cy={cy} r={r + 0.5} fill="none" stroke={eyeConfig.color} strokeWidth={0.7} strokeOpacity={0.8} />
      )}

      {/* Iris */}
      <Circle cx={cx} cy={cy + r * 0.1} r={pr * 1.1} fill={eyeConfig.color} />

      {/* Pupil */}
      <Circle cx={cx} cy={cy + r * 0.1} r={pr * 0.6} fill={eyeConfig.pupilColor} />

      {/* Catch light */}
      <Circle cx={cx - pr * 0.4} cy={cy - pr * 0.3 + r * 0.1} r={pr * 0.22} fill="white" />
    </G>
  );
}

// ── Horn variants ──────────────────────────────────────────────────────────────
function Horns({ dna, headCx, headTop }: { dna: CreatureDna; headCx: number; headTop: number }) {
  if (!dna.features.hasHorns) return null;
  const { primaryColor, accentColor } = dna;
  const count = dna.features.hornCount;
  const spread = count === 3 ? 14 : 10;

  return (
    <G>
      {Array.from({ length: count }, (_, i) => {
        const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
        const tilt = offset * 0.08;
        const h = 14 + Math.abs(offset) * 0.3;
        const bx = headCx + offset;
        const by = headTop + 2;
        return (
          <G key={i}>
            <Path
              d={`M${bx - 4},${by} L${bx + 4},${by} L${bx + tilt},${by - h} Z`}
              fill={primaryColor}
            />
            <Path
              d={`M${bx - 4},${by} L${bx + tilt * 0.5},${by - h * 0.4} L${bx},${by}`}
              fill={accentColor}
              opacity={0.6}
            />
          </G>
        );
      })}
    </G>
  );
}

// ── Wings ─────────────────────────────────────────────────────────────────────
function Wings({ dna, cx, cy }: { dna: CreatureDna; cx: number; cy: number }) {
  if (!dna.features.hasWings) return null;
  const { primaryColor, accentColor } = dna;
  const sz = { small: 20, medium: 30, large: 40 }[dna.features.wingSize];

  return (
    <G opacity={0.85}>
      {/* Left wing */}
      <Path
        d={`M${cx - 8},${cy} Q${cx - sz - 8},${cy - sz * 0.8} ${cx - sz - 2},${cy + sz * 0.3} Q${cx - sz * 0.5},${cy + sz * 0.15} ${cx - 8},${cy} Z`}
        fill={primaryColor}
        opacity={0.75}
      />
      <Path
        d={`M${cx - 8},${cy} Q${cx - sz * 0.6},${cy - sz * 0.4} ${cx - sz - 2},${cy + sz * 0.3}`}
        fill="none"
        stroke={accentColor}
        strokeWidth={0.8}
      />
      {/* Wing veins */}
      {[0.3, 0.6, 0.85].map((t, i) => (
        <Path
          key={i}
          d={`M${cx - 8},${cy} L${cx - 8 - t * (sz + 2)},${cy - sz * 0.2 + t * sz * 0.4}`}
          stroke={accentColor}
          strokeWidth={0.6}
          strokeOpacity={0.5}
        />
      ))}

      {/* Right wing (mirrored) */}
      <Path
        d={`M${cx + 8},${cy} Q${cx + sz + 8},${cy - sz * 0.8} ${cx + sz + 2},${cy + sz * 0.3} Q${cx + sz * 0.5},${cy + sz * 0.15} ${cx + 8},${cy} Z`}
        fill={primaryColor}
        opacity={0.75}
      />
      {[0.3, 0.6, 0.85].map((t, i) => (
        <Path
          key={i}
          d={`M${cx + 8},${cy} L${cx + 8 + t * (sz + 2)},${cy - sz * 0.2 + t * sz * 0.4}`}
          stroke={accentColor}
          strokeWidth={0.6}
          strokeOpacity={0.5}
        />
      ))}
    </G>
  );
}

// ── Tail ──────────────────────────────────────────────────────────────────────
function Tail({ dna, cx, baseY }: { dna: CreatureDna; cx: number; baseY: number }) {
  const { primaryColor, accentColor } = dna;
  const type = dna.features.tailType;

  if (type === "simple") {
    return (
      <Path
        d={`M${cx + 18},${baseY} Q${cx + 35},${baseY - 10} ${cx + 30},${baseY + 15}`}
        stroke={primaryColor} strokeWidth={5} fill="none" strokeLinecap="round"
      />
    );
  }
  if (type === "fluffy") {
    return (
      <G>
        <Path d={`M${cx + 18},${baseY} Q${cx + 35},${baseY - 12} ${cx + 28},${baseY + 18}`}
          stroke={primaryColor} strokeWidth={7} fill="none" strokeLinecap="round" />
        <Path d={`M${cx + 18},${baseY} Q${cx + 35},${baseY - 12} ${cx + 28},${baseY + 18}`}
          stroke={accentColor} strokeWidth={3} fill="none" strokeLinecap="round" strokeOpacity={0.6} />
        <Circle cx={cx + 28} cy={baseY + 18} r={6} fill={primaryColor} />
        <Circle cx={cx + 28} cy={baseY + 18} r={3} fill={accentColor} opacity={0.6} />
      </G>
    );
  }
  if (type === "spiked") {
    return (
      <G>
        <Path d={`M${cx + 16},${baseY} Q${cx + 34},${baseY - 8} ${cx + 32},${baseY + 14}`}
          stroke={primaryColor} strokeWidth={5} fill="none" strokeLinecap="round" />
        {[0, 1, 2].map(i => {
          const t = 0.3 + i * 0.3;
          const px = cx + 16 + t * 16;
          const py = baseY + (t * t * 14 - t * 8);
          return (
            <Path key={i}
              d={`M${px},${py} L${px + 4},${py - 7} L${px + 8},${py}`}
              fill={primaryColor} />
          );
        })}
      </G>
    );
  }
  // dual
  return (
    <G>
      <Path d={`M${cx + 16},${baseY} Q${cx + 35},${baseY - 15} ${cx + 30},${baseY + 10}`}
        stroke={primaryColor} strokeWidth={4} fill="none" strokeLinecap="round" />
      <Path d={`M${cx + 16},${baseY + 4} Q${cx + 34},${baseY + 8} ${cx + 38},${baseY + 20}`}
        stroke={accentColor} strokeWidth={4} fill="none" strokeLinecap="round" />
    </G>
  );
}

// ── Spines ────────────────────────────────────────────────────────────────────
function Spines({ dna, startX, startY, endX }: { dna: CreatureDna; startX: number; startY: number; endX: number }) {
  if (!dna.features.hasSpines) return null;
  const n = Math.min(dna.features.spineCount, 6);
  const { primaryColor } = dna;
  return (
    <G>
      {Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        const sx = startX + t * (endX - startX);
        const sy = startY - Math.sin(t * Math.PI) * 4;
        const h = 8 + Math.sin(t * Math.PI) * 6;
        return (
          <Path key={i}
            d={`M${sx - 3},${sy} L${sx},${sy - h} L${sx + 3},${sy} Z`}
            fill={primaryColor}
          />
        );
      })}
    </G>
  );
}

// ── Glowing veins ─────────────────────────────────────────────────────────────
function GlowingVeins({ dna, cx, cy }: { dna: CreatureDna; cx: number; cy: number }) {
  if (!dna.features.glowingVeins) return null;
  return (
    <G opacity={0.55}>
      <Path d={`M${cx},${cy - 20} Q${cx + 15},${cy} ${cx},${cy + 22}`}
        stroke={dna.accentColor} strokeWidth={1.2} fill="none" />
      <Path d={`M${cx - 18},${cy - 8} Q${cx},${cy} ${cx + 18},${cy - 8}`}
        stroke={dna.accentColor} strokeWidth={1.2} fill="none" />
      <Path d={`M${cx - 10},${cy + 8} Q${cx},${cy + 18} ${cx + 10},${cy + 8}`}
        stroke={dna.accentColor} strokeWidth={1.0} fill="none" />
    </G>
  );
}

// ── Crystal growths ───────────────────────────────────────────────────────────
function CrystalGrowths({ dna, cx, cy }: { dna: CreatureDna; cx: number; cy: number }) {
  if (!dna.features.hasCrystal) return null;
  const positions = [[cx - 22, cy - 5], [cx + 22, cy - 5], [cx, cy - 28]];
  return (
    <G>
      {positions.map(([px, py], i) => (
        <Path key={i}
          d={`M${px! - 4},${py! + 4} L${px!},${py! - 9} L${px! + 4},${py! + 4} Z`}
          fill={dna.accentColor}
          opacity={0.8}
        />
      ))}
    </G>
  );
}

// ── Body archetypes ───────────────────────────────────────────────────────────

function PuffballBody({ dna, v }: { dna: CreatureDna; v: 0 | 1 | 2 }) {
  const { primaryColor, bodyColor, accentColor } = dna;
  const cx = VB / 2;
  // Variant tweaks
  const bRx = [28, 32, 25][v]!;
  const bRy = [22, 20, 26][v]!;
  const hR  = [22, 20, 24][v]!;
  const hCy = 50;

  return (
    <G>
      <Defs>
        <RadialGradient id="puff-body" cx="40%" cy="35%" r="65%">
          <Stop offset="0%"   stopColor={bodyColor}    />
          <Stop offset="100%" stopColor={primaryColor} />
        </RadialGradient>
        <RadialGradient id="puff-head" cx="40%" cy="30%" r="65%">
          <Stop offset="0%"   stopColor={bodyColor}    />
          <Stop offset="100%" stopColor={primaryColor} />
        </RadialGradient>
      </Defs>

      {/* Wings (behind body) */}
      {dna.features.hasWings && <Wings dna={dna} cx={cx} cy={hCy + 4} />}

      {/* Body */}
      <Ellipse cx={cx} cy={hCy + hR + bRy * 0.7} rx={bRx} ry={bRy} fill="url(#puff-body)" />

      {/* Belly marking */}
      <Ellipse cx={cx} cy={hCy + hR + bRy * 0.8} rx={bRx * 0.6} ry={bRy * 0.7}
        fill={bodyColor} opacity={0.55} />

      {/* Tail */}
      <Tail dna={dna} cx={cx} baseY={hCy + hR + bRy * 0.5} />

      {/* Crystal */}
      <CrystalGrowths dna={dna} cx={cx} cy={hCy} />

      {/* Head */}
      <Circle cx={cx} cy={hCy} r={hR} fill="url(#puff-head)" />

      {/* Horns */}
      <Horns dna={dna} headCx={cx} headTop={hCy - hR} />

      {/* Cheek blush */}
      <Ellipse cx={cx - hR * 0.65} cy={hCy + 5} rx={hR * 0.3} ry={hR * 0.18} fill="#ff9999" opacity={0.35} />
      <Ellipse cx={cx + hR * 0.65} cy={hCy + 5} rx={hR * 0.3} ry={hR * 0.18} fill="#ff9999" opacity={0.35} />

      {/* Eyes */}
      <Eye cx={cx - hR * 0.42} cy={hCy - 2} r={hR * 0.30} dna={dna} />
      <Eye cx={cx + hR * 0.42} cy={hCy - 2} r={hR * 0.30} dna={dna} />

      {/* Veins */}
      <GlowingVeins dna={dna} cx={cx} cy={hCy + hR + bRy * 0.5} />

      {/* Smile */}
      <Path d={`M${cx - 7},${hCy + 8} Q${cx},${hCy + 14} ${cx + 7},${hCy + 8}`}
        stroke="#000000" strokeWidth={1.0} fill="none" strokeLinecap="round" strokeOpacity={0.5} />
    </G>
  );
}

function TitanBody({ dna, v }: { dna: CreatureDna; v: 0 | 1 | 2 }) {
  const { primaryColor, bodyColor, accentColor } = dna;
  const cx = VB / 2;
  const bW = [38, 42, 36][v]!;
  const bH = [30, 28, 32][v]!;
  const bCy = 78;
  const hW = [26, 30, 24][v]!;
  const hH = [22, 20, 24][v]!;
  const hCy = bCy - bH * 0.7;

  return (
    <G>
      <Defs>
        <LinearGradient id="titan-body" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={bodyColor}    />
          <Stop offset="100%" stopColor={primaryColor} />
        </LinearGradient>
      </Defs>

      {/* Horns (always on Titans) */}
      <Horns dna={{ ...dna, features: { ...dna.features, hasHorns: true, hornCount: 2 } }}
        headCx={cx} headTop={hCy - hH} />

      {/* Spines on back */}
      <Spines dna={dna} startX={cx - bW * 0.6} startY={bCy - bH * 0.8} endX={cx + bW * 0.6} />

      {/* Shoulder armor plates */}
      {dna.features.hasArmor && (
        <G>
          <Path d={`M${cx - bW * 0.85},${bCy - bH * 0.3} L${cx - bW * 0.55},${bCy - bH * 0.6} L${cx - bW * 0.55},${bCy} L${cx - bW * 0.85},${bCy} Z`}
            fill={accentColor} opacity={0.8} />
          <Path d={`M${cx + bW * 0.55},${bCy - bH * 0.3} L${cx + bW * 0.85},${bCy - bH * 0.6} L${cx + bW * 0.85},${bCy} L${cx + bW * 0.55},${bCy} Z`}
            fill={accentColor} opacity={0.8} />
        </G>
      )}

      {/* Arms */}
      <Path d={`M${cx - bW * 0.9},${bCy - bH * 0.5} L${cx - bW * 0.5},${bCy - bH * 0.2} L${cx - bW * 0.9},${bCy + 4}`}
        fill={primaryColor} />
      <Path d={`M${cx + bW * 0.5},${bCy - bH * 0.5} L${cx + bW * 0.9},${bCy - bH * 0.2} L${cx + bW * 0.5},${bCy + 4}`}
        fill={primaryColor} />

      {/* Body */}
      <Path d={`M${cx - bW},${bCy - bH * 0.4} Q${cx - bW},${bCy - bH} ${cx},${bCy - bH} Q${cx + bW},${bCy - bH} ${cx + bW},${bCy - bH * 0.4} L${cx + bW * 0.8},${bCy} L${cx - bW * 0.8},${bCy} Z`}
        fill="url(#titan-body)" />

      {/* Chest plate */}
      <Path d={`M${cx - bW * 0.4},${bCy - bH * 0.75} L${cx + bW * 0.4},${bCy - bH * 0.75} L${cx + bW * 0.35},${bCy - bH * 0.1} L${cx - bW * 0.35},${bCy - bH * 0.1} Z`}
        fill={accentColor} opacity={0.5} />

      {/* Tail */}
      <Tail dna={dna} cx={cx - 6} baseY={bCy} />

      {/* Head */}
      <Path d={`M${cx - hW},${hCy} Q${cx - hW},${hCy - hH} ${cx},${hCy - hH} Q${cx + hW},${hCy - hH} ${cx + hW},${hCy} Q${cx + hW * 0.9},${hCy + hH * 0.4} ${cx},${hCy + hH * 0.5} Q${cx - hW * 0.9},${hCy + hH * 0.4} ${cx - hW},${hCy} Z`}
        fill={bodyColor} />

      {/* Jaw line */}
      <Path d={`M${cx - hW * 0.6},${hCy + hH * 0.25} Q${cx},${hCy + hH * 0.6} ${cx + hW * 0.6},${hCy + hH * 0.25}`}
        fill={primaryColor} />

      {/* Eyes (narrow, fierce) */}
      <Eye cx={cx - hW * 0.38} cy={hCy - 2} r={hW * 0.22} dna={dna} />
      <Eye cx={cx + hW * 0.38} cy={hCy - 2} r={hW * 0.22} dna={dna} />

      {/* Wings (if any) */}
      {dna.features.hasWings && <Wings dna={dna} cx={cx} cy={bCy - bH * 0.8} />}

      {/* Veins */}
      <GlowingVeins dna={dna} cx={cx} cy={bCy - bH * 0.5} />

      {/* Crystal */}
      <CrystalGrowths dna={dna} cx={cx} cy={bCy - bH * 0.5} />
    </G>
  );
}

function PhantomBody({ dna, v }: { dna: CreatureDna; v: 0 | 1 | 2 }) {
  const { primaryColor, bodyColor, accentColor } = dna;
  const cx = VB / 2;
  const bodyRx = [14, 12, 16][v]!;
  const bodyRy = [32, 36, 28][v]!;
  const bCy = 72;
  const hCy = bCy - bodyRy - 8;

  return (
    <G>
      <Defs>
        <LinearGradient id="phantom-body" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={bodyColor} />
          <Stop offset="100%" stopColor={primaryColor} />
        </LinearGradient>
      </Defs>

      {/* Large swept wings (always on Phantoms) */}
      <Wings dna={{ ...dna, features: { ...dna.features, hasWings: true, wingSize: "large" } }}
        cx={cx} cy={bCy - bodyRy * 0.3} />

      {/* Body (elongated) */}
      <Ellipse cx={cx} cy={bCy} rx={bodyRx} ry={bodyRy} fill="url(#phantom-body)" />

      {/* Belly stripe */}
      <Ellipse cx={cx} cy={bCy + 4} rx={bodyRx * 0.55} ry={bodyRy * 0.75}
        fill={bodyColor} opacity={0.5} />

      {/* Speed fins */}
      {[bCy - bodyRy * 0.5, bCy, bCy + bodyRy * 0.4].map((fy, i) => (
        <G key={i}>
          <Path d={`M${cx - bodyRx},${fy} L${cx - bodyRx - 8},${fy - 5} L${cx - bodyRx - 10},${fy + 5} Z`}
            fill={accentColor} opacity={0.7} />
          <Path d={`M${cx + bodyRx},${fy} L${cx + bodyRx + 8},${fy - 5} L${cx + bodyRx + 10},${fy + 5} Z`}
            fill={accentColor} opacity={0.7} />
        </G>
      ))}

      {/* Tail */}
      <Path d={`M${cx},${bCy + bodyRy - 4} Q${cx + 18},${bCy + bodyRy + 15} ${cx + 5},${bCy + bodyRy + 28}`}
        stroke={primaryColor} strokeWidth={5} fill="none" strokeLinecap="round" />
      <Path d={`M${cx + 5},${bCy + bodyRy + 28} L${cx + 16},${bCy + bodyRy + 35} M${cx + 5},${bCy + bodyRy + 28} L${cx - 5},${bCy + bodyRy + 36}`}
        stroke={accentColor} strokeWidth={3} fill="none" strokeLinecap="round" />

      {/* Head */}
      <Ellipse cx={cx} cy={hCy} rx={10} ry={14} fill={bodyColor} />

      {/* Pointed snout */}
      <Path d={`M${cx - 7},${hCy + 8} Q${cx},${hCy + 18} ${cx + 7},${hCy + 8}`}
        fill={primaryColor} />

      {/* Crest / horns */}
      <Horns dna={dna} headCx={cx} headTop={hCy - 14} />

      {/* Eyes (slanted for speed) */}
      <Eye cx={cx - 5} cy={hCy - 2} r={6} dna={{ ...dna, eyeConfig: { ...dna.eyeConfig, shape: "slant" } }} />
      <Eye cx={cx + 5} cy={hCy - 2} r={6} dna={{ ...dna, eyeConfig: { ...dna.eyeConfig, shape: "slant" } }} />

      {/* Speed lines on body */}
      {[0.2, 0.5, 0.75].map((t, i) => (
        <Path key={i}
          d={`M${cx - bodyRx + 2},${bCy - bodyRy * 0.6 + t * bodyRy * 1.2} L${cx + bodyRx - 2},${bCy - bodyRy * 0.6 + t * bodyRy * 1.2 + 5}`}
          stroke={accentColor} strokeWidth={0.8} strokeOpacity={0.4} />
      ))}

      {/* Veins */}
      <GlowingVeins dna={dna} cx={cx} cy={bCy} />

      {/* Crystal */}
      <CrystalGrowths dna={dna} cx={cx} cy={bCy - 10} />
    </G>
  );
}

function FeralBody({ dna, v }: { dna: CreatureDna; v: 0 | 1 | 2 }) {
  const { primaryColor, bodyColor, accentColor } = dna;
  const cx = VB / 2;
  const bCy = 82;
  const hCy = 48;
  const bW = [30, 28, 32][v]!;

  return (
    <G>
      <Defs>
        <RadialGradient id="feral-body" cx="45%" cy="40%" r="65%">
          <Stop offset="0%"   stopColor={bodyColor}    />
          <Stop offset="100%" stopColor={primaryColor} />
        </RadialGradient>
      </Defs>

      {/* Haunches (legs) */}
      <Ellipse cx={cx - 18} cy={bCy + 2} rx={12} ry={10} fill={primaryColor} />
      <Ellipse cx={cx + 18} cy={bCy + 2} rx={12} ry={10} fill={primaryColor} />

      {/* Claws */}
      {[-26, -20, cx + 20, cx + 26].map((fx, i) => {
        const isLeft = i < 2;
        const footX = isLeft ? cx - 28 + (i * 6) : fx - cx + cx;
        return (
          <Path key={i}
            d={`M${isLeft ? cx - 26 + i * 8 : cx + 12 + i * 4},${bCy + 10} L${isLeft ? cx - 22 + i * 8 : cx + 16 + i * 4},${bCy + 16}`}
            stroke={accentColor} strokeWidth={2} strokeLinecap="round" />
        );
      })}

      {/* Main torso */}
      <Path d={`M${cx - bW},${bCy} Q${cx - bW * 1.1},${bCy - 25} ${cx},${bCy - 35} Q${cx + bW * 1.1},${bCy - 25} ${cx + bW},${bCy} Q${cx},${bCy + 10} ${cx - bW},${bCy} Z`}
        fill="url(#feral-body)" />

      {/* Dorsal spines */}
      <Spines dna={{ ...dna, features: { ...dna.features, hasSpines: true, spineCount: 5 } }}
        startX={cx - bW * 0.5} startY={bCy - 32} endX={cx + bW * 0.5} />

      {/* Branching tail */}
      <Path d={`M${cx + bW * 0.8},${bCy - 8} Q${cx + bW + 18},${bCy - 5} ${cx + bW + 22},${bCy + 10}`}
        stroke={primaryColor} strokeWidth={5} fill="none" strokeLinecap="round" />
      <Path d={`M${cx + bW + 18},${bCy + 4} L${cx + bW + 30},${bCy - 2}`}
        stroke={accentColor} strokeWidth={3} strokeLinecap="round" />
      <Path d={`M${cx + bW + 20},${bCy + 8} L${cx + bW + 30},${bCy + 16}`}
        stroke={accentColor} strokeWidth={3} strokeLinecap="round" />

      {/* Neck */}
      <Path d={`M${cx - 14},${bCy - 32} Q${cx},${bCy - 42} ${cx + 14},${bCy - 32}`}
        fill={bodyColor} />

      {/* Head (low, wide with snout) */}
      <Path d={`M${cx - 22},${hCy + 8} Q${cx - 24},${hCy - 14} ${cx},${hCy - 18} Q${cx + 24},${hCy - 14} ${cx + 22},${hCy + 8} Q${cx + 16},${hCy + 20} ${cx + 8},${hCy + 24} L${cx - 8},${hCy + 24} Q${cx - 16},${hCy + 20} ${cx - 22},${hCy + 8} Z`}
        fill={bodyColor} />

      {/* Snout */}
      <Ellipse cx={cx} cy={hCy + 20} rx={10} ry={7} fill={primaryColor} />

      {/* Fangs */}
      <Path d={`M${cx - 6},${hCy + 18} L${cx - 4},${hCy + 28} L${cx - 2},${hCy + 18}`}
        fill="white" />
      <Path d={`M${cx + 2},${hCy + 18} L${cx + 4},${hCy + 28} L${cx + 6},${hCy + 18}`}
        fill="white" />

      {/* Horns / ears */}
      {dna.features.hasHorns
        ? <Horns dna={dna} headCx={cx} headTop={hCy - 18} />
        : (
          <G>
            <Path d={`M${cx - 20},${hCy - 10} L${cx - 26},${hCy - 24} L${cx - 12},${hCy - 14} Z`} fill={primaryColor} />
            <Path d={`M${cx + 12},${hCy - 14} L${cx + 26},${hCy - 24} L${cx + 20},${hCy - 10} Z`} fill={primaryColor} />
          </G>
        )
      }

      {/* Mane */}
      {dna.features.hasMane && (
        <G opacity={0.7}>
          {[-18, -10, -2, 6, 14].map((ox, i) => (
            <Path key={i}
              d={`M${cx + ox},${hCy - 2} Q${cx + ox - 4},${hCy - 14} ${cx + ox},${hCy - 20}`}
              stroke={accentColor} strokeWidth={3} fill="none" strokeLinecap="round" />
          ))}
        </G>
      )}

      {/* Angry eyes */}
      <Eye cx={cx - 12} cy={hCy - 2} r={7} dna={{ ...dna, eyeConfig: { ...dna.eyeConfig, shape: "slant" } }} />
      <Eye cx={cx + 12} cy={hCy - 2} r={7} dna={{ ...dna, eyeConfig: { ...dna.eyeConfig, shape: "slant" } }} />

      {/* Wings (rare beast variant) */}
      {dna.features.hasWings && <Wings dna={dna} cx={cx} cy={bCy - 28} />}

      {/* Veins */}
      <GlowingVeins dna={dna} cx={cx} cy={bCy - 18} />

      {/* Crystal */}
      <CrystalGrowths dna={dna} cx={cx} cy={bCy - 25} />
    </G>
  );
}

// ── Aura ring ─────────────────────────────────────────────────────────────────
function AuraRing({ dna }: { dna: CreatureDna }) {
  const { color, opacity } = dna.aura;
  return (
    <G>
      <Defs>
        <RadialGradient id="aura-rg" cx="50%" cy="50%" r="50%">
          <Stop offset="0%"   stopColor={color} stopOpacity={0} />
          <Stop offset="65%"  stopColor={color} stopOpacity={0} />
          <Stop offset="100%" stopColor={color} stopOpacity={opacity} />
        </RadialGradient>
      </Defs>
      <Circle cx={VB / 2} cy={VB / 2 + 4} r={VB * 0.48} fill="url(#aura-rg)" />
    </G>
  );
}

// ── Body dispatcher ───────────────────────────────────────────────────────────
function CreatureBody({ dna }: { dna: CreatureDna }) {
  switch (dna.archetype) {
    case "puffball": return <PuffballBody dna={dna} v={dna.variant} />;
    case "titan":    return <TitanBody    dna={dna} v={dna.variant} />;
    case "phantom":  return <PhantomBody  dna={dna} v={dna.variant} />;
    case "feral":    return <FeralBody    dna={dna} v={dna.variant} />;
  }
}

// ── Full SVG ──────────────────────────────────────────────────────────────────
function CreatureSvg({ dna, w }: { dna: CreatureDna; w: number }) {
  return (
    <Svg width={w} height={w} viewBox={`0 0 ${VB} ${VB}`}>
      <AuraRing dna={dna} />
      <CreatureBody dna={dna} />
    </Svg>
  );
}

// ── Animated breathing ────────────────────────────────────────────────────────
function BreathingWrapper({ dna, children }: { dna: CreatureDna; children: React.ReactNode }) {
  const breath = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const depth = dna.breathDepth;
    Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1 + depth,  duration: 1800, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 1 - depth * 0.5, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
    return () => breath.stopAnimation();
  }, [dna.breathDepth]);

  return (
    <Animated.View style={{ transform: [{ scaleY: breath }] }}>
      {children}
    </Animated.View>
  );
}

// ── Shiny shimmer overlay ─────────────────────────────────────────────────────
function ShinyShimmer({ size }: { size: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1600, useNativeDriver: true })
    ).start();
    return () => anim.stopAnimation();
  }, []);

  const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [-size, size * 1.5] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", inset: 0, overflow: "hidden" }, { transform: [{ translateX: tx }] }]}
    >
      <Svg width={size * 0.35} height={size} viewBox={`0 0 ${size * 0.35} ${size}`}>
        <Defs>
          <LinearGradient id="shiny-g" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%"   stopColor="white" stopOpacity={0} />
            <Stop offset="50%"  stopColor="white" stopOpacity={0.45} />
            <Stop offset="100%" stopColor="white" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={`M0,${size * 0.1} L${size * 0.35},0 L${size * 0.35},${size} L0,${size * 0.9} Z`}
          fill="url(#shiny-g)" />
      </Svg>
    </Animated.View>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export function GenerativeCreature({ creature, size = 110 }: Props) {
  const realm  = creature.realm ?? creature.genetics?.realm ?? "balance";
  const rarity = creature.rarity ?? "common";
  const shiny  = creature.isShiny ?? false;

  const dna = useMemo(
    () => generateCreatureDna(creature.id, realm, rarity, shiny),
    [creature.id, realm, rarity, shiny],
  );

  return (
    <View style={{ width: size, height: size }}>
      <BreathingWrapper dna={dna}>
        <CreatureSvg dna={dna} w={size} />
      </BreathingWrapper>
      {shiny && <ShinyShimmer size={size} />}
    </View>
  );
}
