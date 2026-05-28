import type { LegendaryRarity } from "@/components/legendary-hatch-cinematic";

export interface HatchShareImageOpts {
  name: string;
  species: string;
  rarity: LegendaryRarity;
  realmEmoji: string;
  realmColor: string;
  steps: number;
}

// ── Rarity color stops ─────────────────────────────────────────────────────────
const RARITY_GRADIENT: Record<LegendaryRarity, [string, string]> = {
  Legendary: ["#3b1f00", "#6b3a00"],
  Mythic:    ["#3b0011", "#6b0022"],
  Ancient:   ["#003b35", "#006b5f"],
  Celestial: ["#0a0038", "#1a0060"],
};

const RARITY_TEXT_COLOR: Record<LegendaryRarity, string> = {
  Legendary: "#facc15",
  Mythic:    "#f87171",
  Ancient:   "#2dd4bf",
  Celestial: "#e0f2fe",
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Generates a 600×340 shareable hatch card as a PNG Blob.
 * Uses an offscreen CanvasElement — works in all modern browsers.
 */
export async function generateHatchShareImage(opts: HatchShareImageOpts): Promise<Blob> {
  const W = 600;
  const H = 340;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const [bg1, bg2] = RARITY_GRADIENT[opts.rarity];
  const textColor = RARITY_TEXT_COLOR[opts.rarity];

  // ── Background ────────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, bg1);
  bgGrad.addColorStop(1, bg2);
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.fill();

  // ── Radial center glow ─────────────────────────────────────────────────────
  const radial = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 220);
  radial.addColorStop(0, opts.realmColor + "55");
  radial.addColorStop(1, "transparent");
  ctx.fillStyle = radial;
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.fill();

  // ── Border ────────────────────────────────────────────────────────────────────
  ctx.strokeStyle = opts.realmColor + "cc";
  ctx.lineWidth = 2.5;
  roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 27);
  ctx.stroke();

  // ── HatchUp brand bar (top) ────────────────────────────────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, 0, 0, W, 44, 28);
  ctx.fill();

  ctx.font = "bold 18px 'Outfit', 'Inter', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.textAlign = "left";
  ctx.fillText("🥚 HatchUp", 22, 28);

  ctx.textAlign = "right";
  ctx.font = "12px 'Space Mono', monospace";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("hatchup.app", W - 22, 28);

  // ── Realm emoji ────────────────────────────────────────────────────────────────
  ctx.textAlign = "center";
  ctx.font = "80px serif";
  ctx.fillText(opts.realmEmoji, W / 2, 165);

  // ── Glow under emoji ─────────────────────────────────────────────────────────
  const emojiGlow = ctx.createRadialGradient(W / 2, 145, 0, W / 2, 145, 60);
  emojiGlow.addColorStop(0, opts.realmColor + "44");
  emojiGlow.addColorStop(1, "transparent");
  ctx.fillStyle = emojiGlow;
  ctx.fillRect(W / 2 - 60, 85, 120, 120);

  // ── Rarity label ─────────────────────────────────────────────────────────────
  ctx.font = "bold 12px 'Outfit', 'Inter', sans-serif";
  ctx.letterSpacing = "0.2em";
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  const rarityLabel = `✦ ${opts.rarity.toUpperCase()} ✦`;
  ctx.fillText(rarityLabel, W / 2, 200);

  // ── Rarity badge pill ────────────────────────────────────────────────────────
  const pillW = 110;
  const pillH = 26;
  const pillX = W / 2 - pillW / 2;
  const pillY = 209;
  ctx.fillStyle = opts.realmColor + "33";
  ctx.strokeStyle = opts.realmColor + "bb";
  ctx.lineWidth = 1.5;
  roundRect(ctx, pillX, pillY, pillW, pillH, 13);
  ctx.fill();
  ctx.stroke();

  ctx.font = "bold 11px 'Outfit', 'Inter', sans-serif";
  ctx.fillStyle = textColor;
  ctx.fillText(opts.rarity.toUpperCase(), W / 2, pillY + 17);

  // ── Creature name ────────────────────────────────────────────────────────────
  ctx.font = "bold 30px 'Outfit', 'Inter', sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = opts.realmColor;
  ctx.shadowBlur = 14;
  ctx.fillText(opts.name, W / 2, 268);
  ctx.shadowBlur = 0;

  // ── Species ──────────────────────────────────────────────────────────────────
  ctx.font = "14px 'Outfit', 'Inter', sans-serif";
  ctx.fillStyle = textColor;
  ctx.fillText(opts.species, W / 2, 288);

  // ── Divider ───────────────────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 303);
  ctx.lineTo(W - 60, 303);
  ctx.stroke();

  // ── Steps footer ─────────────────────────────────────────────────────────────
  ctx.font = "12px 'Space Mono', monospace";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText(`${opts.steps.toLocaleString()} steps · HatchUp`, W / 2, 325);

  // ── Return as Blob ────────────────────────────────────────────────────────────
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}
