/**
 * GenerativeEgg — procedural RPG-quality egg art driven entirely by the egg's
 * ID, type, and rarity. Same inputs always produce the same visual output.
 *
 * Layers (bottom → top):
 *   1. Outer aura  (radial gradient, rarity-tinted)
 *   2. Egg body    (radial gradient, type-palette)
 *   3. Pattern     (scales / hex / swirl / runes / crystal / dots, clipped)
 *   4. Specular    (white crescent near top-left)
 *   5. Gems        (rarity-count colored diamonds, clipped)
 *   6. Rune marks  (ancient / celestial only)
 *   7. Crack lines (legendary / mythic chance)
 *   8. Edge stroke (rarity color, subtle glow)
 *   9. Shimmer     (animated diagonal highlight, uncommon+)
 *  10. Particles   (floating sparks around egg, rare+)
 */

import React, { useEffect, useRef, useMemo } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, {
  Ellipse, Circle, Path, G, Defs, Rect,
  LinearGradient, RadialGradient, Stop, ClipPath,
} from "react-native-svg";
import { generateEggDna, type EggDna } from "@/lib/generative/eggDna";

export interface EggLike {
  id:      number;
  type?:   string | null;
  rarity?: string | null;
}

interface Props {
  egg:  EggLike;
  size?: number;
}

// ── Pattern generators ────────────────────────────────────────────────────────

function ScalesPattern({ color, opacity }: { color: string; opacity: number }) {
  const rows = 8, cols = 6;
  const rw = 18, rh = 12;
  return (
    <G opacity={opacity}>
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => {
          const x = col * rw - (row % 2 === 0 ? 0 : rw / 2) - 5;
          const y = row * (rh * 0.7) - 10;
          return (
            <Path
              key={`${row}-${col}`}
              d={`M${x + rw/2},${y} C${x + rw*0.1},${y} ${x},${y + rh*0.6} ${x + rw/2},${y + rh} C${x + rw},${y + rh*0.6} ${x + rw*0.9},${y} ${x + rw/2},${y} Z`}
              fill="none"
              stroke={color}
              strokeWidth={0.8}
            />
          );
        })
      )}
    </G>
  );
}

function HexPattern({ color, opacity }: { color: string; opacity: number }) {
  const hex = (cx: number, cy: number, r: number) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    });
    return `M${pts.join("L")}Z`;
  };
  const r = 10;
  const positions = [
    [30,25],[50,25],[70,25],[20,42],[40,42],[60,42],[80,42],
    [30,59],[50,59],[70,59],[20,76],[40,76],[60,76],[80,76],
    [30,93],[50,93],[70,93],
  ];
  return (
    <G opacity={opacity}>
      {positions.map(([cx, cy], i) => (
        <Path key={i} d={hex(cx!, cy!, r)} fill="none" stroke={color} strokeWidth={0.7} />
      ))}
    </G>
  );
}

function SwirlPattern({ color, opacity }: { color: string; opacity: number }) {
  return (
    <G opacity={opacity}>
      <Path d="M50,10 C80,20 90,50 70,80 C50,110 20,100 15,70 C10,40 30,15 50,10 Z"
        fill="none" stroke={color} strokeWidth={1.2} />
      <Path d="M50,25 C70,32 78,55 65,75 C52,95 30,88 27,68 C24,48 38,28 50,25 Z"
        fill="none" stroke={color} strokeWidth={0.9} />
      <Path d="M50,40 C62,45 67,60 59,72 C51,84 37,80 36,67 C35,54 42,42 50,40 Z"
        fill="none" stroke={color} strokeWidth={0.7} />
    </G>
  );
}

function CrystalPattern({ color, opacity }: { color: string; opacity: number }) {
  const lines = [
    "M50,10 L20,65","M50,10 L80,65","M50,10 L50,115",
    "M20,65 L50,115","M80,65 L50,115","M20,65 L80,65",
    "M35,38 L65,38","M27,55 L73,55","M30,82 L70,82",
  ];
  return (
    <G opacity={opacity}>
      {lines.map((d, i) => <Path key={i} d={d} stroke={color} strokeWidth={0.6} fill="none" />)}
    </G>
  );
}

function DotsPattern({ color, opacity }: { color: string; opacity: number }) {
  const dots = [
    [25,25],[50,20],[75,25],[15,45],[40,42],[60,42],[85,45],
    [22,65],[45,62],[55,62],[78,65],[30,85],[50,82],[70,85],
    [20,100],[50,105],[80,100],
  ];
  return (
    <G opacity={opacity}>
      {dots.map(([cx, cy], i) => (
        <Circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 2.5 : 1.8} fill={color} />
      ))}
    </G>
  );
}

function RunesPattern({ color, opacity }: { color: string; opacity: number }) {
  const runes = [
    "M30,30 L30,50 M22,40 L38,40",
    "M70,28 L70,48 M62,38 L78,38 M62,28 L78,28",
    "M25,70 L35,60 L45,70 L35,80 Z",
    "M55,65 L75,65 L65,80 Z",
    "M30,95 L30,110 M23,95 L37,95 M23,110 L37,110",
    "M70,90 L70,108 M63,99 L77,99 M66,90 L74,108",
  ];
  return (
    <G opacity={opacity}>
      {runes.map((d, i) => <Path key={i} d={d} stroke={color} strokeWidth={1.2} fill="none" strokeLinecap="round" />)}
    </G>
  );
}

function SparkPattern({ color, opacity }: { color: string; opacity: number }) {
  const sparks = [
    [25,30,6],[50,18,8],[75,30,6],[82,55,5],[75,85,6],[50,100,7],[25,85,6],[18,55,5],
    [38,48,4],[62,48,4],[30,72,4],[70,72,4],
  ];
  return (
    <G opacity={opacity}>
      {sparks.map(([cx, cy, r], i) => {
        const a = (i * 37) % 360;
        const x1 = cx! + r! * Math.cos(a * Math.PI/180);
        const y1 = cy! + r! * Math.sin(a * Math.PI/180);
        const x2 = cx! + r! * Math.cos((a+180) * Math.PI/180);
        const y2 = cy! + r! * Math.sin((a+180) * Math.PI/180);
        const x3 = cx! + r! * Math.cos((a+90) * Math.PI/180);
        const y3 = cy! + r! * Math.sin((a+90) * Math.PI/180);
        const x4 = cx! + r! * Math.cos((a+270) * Math.PI/180);
        const y4 = cy! + r! * Math.sin((a+270) * Math.PI/180);
        return (
          <G key={i}>
            <Path d={`M${x1},${y1} L${x2},${y2}`} stroke={color} strokeWidth={0.8} />
            <Path d={`M${x3},${y3} L${x4},${y4}`} stroke={color} strokeWidth={0.8} />
          </G>
        );
      })}
    </G>
  );
}

function VinesPattern({ color, opacity }: { color: string; opacity: number }) {
  return (
    <G opacity={opacity}>
      <Path d="M50,10 Q30,30 20,60 Q15,90 30,110" fill="none" stroke={color} strokeWidth={1.0} />
      <Path d="M50,10 Q70,30 80,60 Q85,90 70,110" fill="none" stroke={color} strokeWidth={1.0} />
      <Path d="M20,50 Q35,42 40,55" fill="none" stroke={color} strokeWidth={0.8} />
      <Path d="M80,50 Q65,42 60,55" fill="none" stroke={color} strokeWidth={0.8} />
      <Path d="M18,72 Q33,65 36,78" fill="none" stroke={color} strokeWidth={0.8} />
      <Path d="M82,72 Q67,65 64,78" fill="none" stroke={color} strokeWidth={0.8} />
      <Circle cx={20} cy={50} r={3} fill={color} />
      <Circle cx={80} cy={50} r={3} fill={color} />
      <Circle cx={18} cy={72} r={3} fill={color} />
      <Circle cx={82} cy={72} r={3} fill={color} />
    </G>
  );
}

function EggPattern({ dna }: { dna: EggDna }) {
  const color = dna.glowColor;
  const opacity = dna.patternOpacity;
  switch (dna.pattern) {
    case "scales":  return <ScalesPattern  color={color} opacity={opacity} />;
    case "hex":     return <HexPattern     color={color} opacity={opacity} />;
    case "swirl":   return <SwirlPattern   color={color} opacity={opacity} />;
    case "runes":   return <RunesPattern   color={color} opacity={opacity} />;
    case "crystal": return <CrystalPattern color={color} opacity={opacity} />;
    case "dots":    return <DotsPattern    color={color} opacity={opacity} />;
    case "sparks":  return <SparkPattern   color={color} opacity={opacity} />;
    case "vines":   return <VinesPattern   color={color} opacity={opacity} />;
    default:        return null;
  }
}

// ── Gem shape ─────────────────────────────────────────────────────────────────
const GEM_POSITIONS = [
  [50, 38], [32, 58], [68, 58], [40, 82], [60, 82], [50, 100],
];

function Gems({ dna }: { dna: EggDna }) {
  return (
    <>
      {Array.from({ length: dna.gemCount }, (_, i) => {
        const [gx, gy] = GEM_POSITIONS[i % GEM_POSITIONS.length]!;
        const color = dna.gemColors[i % dna.gemColors.length]!;
        const r = 4 + (i === 0 ? 1.5 : 0);
        return (
          <G key={i}>
            {/* Diamond shape */}
            <Path
              d={`M${gx},${gy - r} L${gx + r * 0.7},${gy} L${gx},${gy + r} L${gx - r * 0.7},${gy} Z`}
              fill={color}
              opacity={0.9}
            />
            {/* Gem highlight */}
            <Path
              d={`M${gx - r * 0.3},${gy - r * 0.5} L${gx + r * 0.3},${gy - r * 0.5} L${gx},${gy - r * 0.05}`}
              fill="white"
              opacity={0.5}
            />
          </G>
        );
      })}
    </>
  );
}

// ── Crack lines ───────────────────────────────────────────────────────────────
function CrackLines() {
  return (
    <G opacity={0.35}>
      <Path d="M48,45 L44,58 L50,62 L46,78" stroke="#ffffff" strokeWidth={0.9} fill="none" strokeLinecap="round" />
      <Path d="M44,58 L39,55" stroke="#ffffff" strokeWidth={0.7} fill="none" strokeLinecap="round" />
      <Path d="M52,70 L56,75 L54,85" stroke="#ffffff" strokeWidth={0.7} fill="none" strokeLinecap="round" />
    </G>
  );
}

// ── Rune overlay ──────────────────────────────────────────────────────────────
function AncientRunes({ color }: { color: string }) {
  return (
    <G opacity={0.45}>
      <Path d="M22,38 L22,52 M16,45 L28,45" stroke={color} strokeWidth={1.0} strokeLinecap="round" fill="none" />
      <Path d="M78,38 L78,52 M72,38 L84,38 M72,52 L84,52" stroke={color} strokeWidth={1.0} strokeLinecap="round" fill="none" />
      <Path d="M30,90 L40,80 L50,90 L40,100 Z" fill="none" stroke={color} strokeWidth={0.9} />
      <Circle cx={50} cy={62} r={22} fill="none" stroke={color} strokeWidth={0.6} strokeDasharray="3,4" />
    </G>
  );
}

// ── Particle ──────────────────────────────────────────────────────────────────
interface ParticleProps {
  color:  string;
  count:  number;
  svgW:   number;
  svgH:   number;
}

function ParticlesLayer({ color, count, svgW, svgH }: ParticleProps) {
  const anims = useRef(
    Array.from({ length: count }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 250),
          Animated.timing(anim, { toValue: 1, duration: 2000 + i * 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);

  // Positions around egg perimeter
  const positions = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const r = (svgW * 0.45) + (i % 2 === 0 ? 4 : 8);
    return {
      x: svgW / 2 + r * Math.cos(angle),
      y: svgH / 2 + r * Math.sin(angle) - svgH * 0.06,
      anim: anims[i]!,
    };
  });

  return (
    <>
      {positions.map((p, i) => {
        const opacity = p.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
        const translateY = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: p.x - 3,
              top: p.y - 3,
              opacity,
              transform: [{ translateY }],
            }}
          >
            <Svg width={6} height={6} viewBox="0 0 6 6">
              <Circle cx={3} cy={3} r={i % 3 === 0 ? 2.5 : 1.5} fill={color} />
            </Svg>
          </Animated.View>
        );
      })}
    </>
  );
}

// ── Animated shimmer ──────────────────────────────────────────────────────────
function ShimmerOverlay({ svgW, svgH }: { svgW: number; svgH: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: true })
    ).start();
    return () => anim.stopAnimation();
  }, []);

  const translateX = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [-svgW * 0.8, svgW * 1.6],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { transform: [{ translateX }], overflow: "hidden" },
      ]}
    >
      <Svg width={svgW * 0.4} height={svgH} viewBox={`0 0 ${svgW * 0.4} ${svgH}`}>
        <Defs>
          <LinearGradient id="shimmer-g" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%"   stopColor="white" stopOpacity={0} />
            <Stop offset="40%"  stopColor="white" stopOpacity={0.22} />
            <Stop offset="60%"  stopColor="white" stopOpacity={0.28} />
            <Stop offset="100%" stopColor="white" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={svgW * 0.4} height={svgH} fill="url(#shimmer-g)" />
      </Svg>
    </Animated.View>
  );
}

// ── Pulse glow ────────────────────────────────────────────────────────────────
function PulseGlow({ color, svgW, svgH }: { color: string; svgW: number; svgH: number }) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
    return () => anim.stopAnimation();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: anim }]}
    >
      <Svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
        <Defs>
          <RadialGradient id="pulse-g" cx="50%" cy="50%" r="50%">
            <Stop offset="50%" stopColor={color} stopOpacity={0} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.18} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={svgW / 2} cy={svgH / 2} rx={svgW * 0.52} ry={svgH * 0.52} fill="url(#pulse-g)" />
      </Svg>
    </Animated.View>
  );
}

// ── Main egg SVG ──────────────────────────────────────────────────────────────

/** Shape variants: 0=classic, 1=rounder, 2=taller */
const SHAPE_PARAMS = [
  { rx: 38, ry: 50, cy: 64 },  // classic
  { rx: 40, ry: 44, cy: 64 },  // rounder
  { rx: 34, ry: 56, cy: 66 },  // taller
];

function EggSvg({ dna, w, h }: { dna: EggDna; w: number; h: number }) {
  const sp = SHAPE_PARAMS[dna.shapeVariant];
  const glowOpacity = dna.glowIntensity;

  return (
    <Svg width={w} height={h} viewBox="0 0 100 120">
      <Defs>
        <RadialGradient id={`eg-${dna.type}`} cx="38%" cy="30%" r="68%">
          <Stop offset="0%"   stopColor="#ffffff"          stopOpacity={0.35} />
          <Stop offset="25%"  stopColor={dna.primaryColor} stopOpacity={1} />
          <Stop offset="75%"  stopColor={dna.secondaryColor} stopOpacity={1} />
          <Stop offset="100%" stopColor={dna.accentColor}  stopOpacity={0.85} />
        </RadialGradient>

        <RadialGradient id={`oa-${dna.type}`} cx="50%" cy="52%" r="50%">
          <Stop offset="0%"   stopColor={dna.glowColor} stopOpacity={0} />
          <Stop offset="65%"  stopColor={dna.glowColor} stopOpacity={0} />
          <Stop offset="100%" stopColor={dna.glowColor} stopOpacity={glowOpacity} />
        </RadialGradient>

        <ClipPath id={`ec-${dna.type}`}>
          <Ellipse cx={50} cy={sp!.cy} rx={sp!.rx} ry={sp!.ry} />
        </ClipPath>
      </Defs>

      {/* Outer glow halo */}
      <Ellipse cx={50} cy={sp!.cy} rx={sp!.rx + 8} ry={sp!.ry + 8} fill={`url(#oa-${dna.type})`} />

      {/* Egg base */}
      <Ellipse cx={50} cy={sp!.cy} rx={sp!.rx} ry={sp!.ry} fill={`url(#eg-${dna.type})`} />

      {/* Pattern (clipped) */}
      <G clipPath={`url(#ec-${dna.type})`}>
        <EggPattern dna={dna} />
      </G>

      {/* Specular highlight */}
      <Ellipse cx={36} cy={sp!.cy - sp!.ry * 0.55} rx={12} ry={8}
        fill="white" opacity={0.25} />
      <Ellipse cx={32} cy={sp!.cy - sp!.ry * 0.62} rx={5} ry={3.5}
        fill="white" opacity={0.35} />

      {/* Gems (clipped) */}
      <G clipPath={`url(#ec-${dna.type})`}>
        <Gems dna={dna} />
      </G>

      {/* Ancient / Celestial runes */}
      {dna.hasRune && (
        <G clipPath={`url(#ec-${dna.type})`}>
          <AncientRunes color={dna.glowColor} />
        </G>
      )}

      {/* Crack lines */}
      {dna.hasCrack && (
        <G clipPath={`url(#ec-${dna.type})`}>
          <CrackLines />
        </G>
      )}

      {/* Edge stroke */}
      <Ellipse cx={50} cy={sp!.cy} rx={sp!.rx} ry={sp!.ry}
        fill="none" stroke={dna.glowColor} strokeWidth={1.4} strokeOpacity={0.7} />

      {/* Inner edge darkening */}
      <Ellipse cx={50} cy={sp!.cy} rx={sp!.rx - 2} ry={sp!.ry - 2}
        fill="none" stroke="#000000" strokeWidth={1.5} strokeOpacity={0.12} />
    </Svg>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function GenerativeEgg({ egg, size = 90 }: Props) {
  const dna = useMemo(
    () => generateEggDna(egg.id, egg.type ?? "balanced", egg.rarity ?? "common"),
    [egg.id, egg.type, egg.rarity],
  );

  const w = size;
  const h = Math.round(size * 1.2);

  return (
    <View style={{ width: w, height: h }} collapsable={false}>
      {/* Egg base art */}
      <EggSvg dna={dna} w={w} h={h} />

      {/* Pulsing outer glow (epic+) */}
      {["epic","legendary","mythic","ancient","celestial"].includes(dna.rarity) && (
        <PulseGlow color={dna.glowColor} svgW={w} svgH={h} />
      )}

      {/* Shimmer sweep (uncommon+) */}
      {dna.shimmer && <ShimmerOverlay svgW={w} svgH={h} />}

      {/* Floating particles (rare+) */}
      {dna.particleCount > 0 && (
        <ParticlesLayer
          color={dna.particleColor}
          count={dna.particleCount}
          svgW={w}
          svgH={h}
        />
      )}
    </View>
  );
}
