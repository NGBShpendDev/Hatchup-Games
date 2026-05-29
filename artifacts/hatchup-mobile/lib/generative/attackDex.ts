import { seededRng } from "./seed";

export interface Attack {
  name:        string;
  description: string;
  type:        string;
  tier:        "basic" | "special" | "signature";
  damageMult:  number;
  energyCost:  number;
  effect?:     string;
}

const ATTACKS_BY_REALM: Record<string, Attack[]> = {
  strength: [
    { name: "Power Slam",     description: "Channels raw power into a crushing slam.",           type: "strength", tier: "basic",     damageMult: 1.0,  energyCost: 10 },
    { name: "Iron Fist",      description: "A hardened strike that cracks stone.",               type: "strength", tier: "basic",     damageMult: 1.1,  energyCost: 12 },
    { name: "Boulder Crush",  description: "Summons the force of a falling mountain.",           type: "strength", tier: "special",   damageMult: 2.0,  energyCost: 25, effect: "defense_down" },
    { name: "Titan Roar",     description: "A deafening roar that shakes the earth.",            type: "strength", tier: "special",   damageMult: 1.8,  energyCost: 22, effect: "stun" },
    { name: "Colossus Break", description: "The ultimate show of might — obliterates defenses.", type: "strength", tier: "signature", damageMult: 2.6,  energyCost: 40, effect: "armor_pierce" },
    { name: "Magma Punch",    description: "A molten fist that sears through any shield.",       type: "strength", tier: "signature", damageMult: 2.4,  energyCost: 38, effect: "burn" },
    { name: "Gravity Press",  description: "Forces the enemy down with crushing weight.",        type: "strength", tier: "special",   damageMult: 2.1,  energyCost: 28, effect: "slow" },
    { name: "Earthbreaker",   description: "Splits the ground beneath the opponent.",            type: "strength", tier: "signature", damageMult: 2.8,  energyCost: 45, effect: "bleed" },
  ],
  cardio: [
    { name: "Swift Strike",   description: "Too fast to dodge — a blurring hit.",               type: "cardio", tier: "basic",     damageMult: 0.9,  energyCost: 8  },
    { name: "Wind Blade",     description: "Razor-sharp air slices like a blade.",              type: "cardio", tier: "basic",     damageMult: 1.0,  energyCost: 10 },
    { name: "Tempest Dash",   description: "Accelerates to sonic speed and rams the foe.",     type: "cardio", tier: "special",   damageMult: 1.9,  energyCost: 22, effect: "speed_boost" },
    { name: "Cyclone Spin",   description: "Creates a vortex that tears enemies apart.",       type: "cardio", tier: "special",   damageMult: 2.0,  energyCost: 25, effect: "multi_hit" },
    { name: "Void Sprint",    description: "Phase-shifts through reality itself.",              type: "cardio", tier: "signature", damageMult: 2.5,  energyCost: 38, effect: "phase" },
    { name: "Sonic Shatter",  description: "Breaks the sound barrier against the target.",     type: "cardio", tier: "signature", damageMult: 2.7,  energyCost: 42, effect: "stun" },
    { name: "Gale Force",     description: "Unleashes a hurricane-speed strike.",              type: "cardio", tier: "special",   damageMult: 1.8,  energyCost: 20 },
    { name: "Phantom Rush",   description: "Leaves afterimages while striking multiple times.",type: "cardio", tier: "signature", damageMult: 2.9,  energyCost: 45, effect: "multi_hit" },
  ],
  balance: [
    { name: "Mana Pulse",     description: "Fires a balanced burst of arcane energy.",         type: "balance", tier: "basic",     damageMult: 1.0,  energyCost: 10 },
    { name: "Crystal Shot",   description: "Launches a piercing shard of crystal.",            type: "balance", tier: "basic",     damageMult: 1.05, energyCost: 10 },
    { name: "Aura Burst",     description: "Releases a shockwave of pure energy.",             type: "balance", tier: "special",   damageMult: 1.9,  energyCost: 22 },
    { name: "Prism Beam",     description: "Splits into seven colored energy rays.",           type: "balance", tier: "special",   damageMult: 2.0,  energyCost: 24, effect: "multi_hit" },
    { name: "Astral Strike",  description: "Channels the power of the cosmos.",                type: "balance", tier: "signature", damageMult: 2.6,  energyCost: 40, effect: "true_damage" },
    { name: "Void Rupture",   description: "Tears a rift in space-time around the foe.",      type: "balance", tier: "signature", damageMult: 2.7,  energyCost: 42 },
    { name: "Harmonic Wave",  description: "Resonates at the enemy's weak frequency.",        type: "balance", tier: "special",   damageMult: 2.1,  energyCost: 26 },
    { name: "Zenith Cannon",  description: "The apex of balanced combat mastery.",             type: "balance", tier: "signature", damageMult: 3.0,  energyCost: 50, effect: "stun" },
  ],
  beast: [
    { name: "Feral Claw",     description: "Wild slashing with razor-sharp claws.",            type: "beast", tier: "basic",     damageMult: 1.05, energyCost: 10 },
    { name: "Venom Bite",     description: "A toxic bite that lingers with poison.",           type: "beast", tier: "basic",     damageMult: 0.95, energyCost: 9,  effect: "poison" },
    { name: "Pack Howl",      description: "A terrifying howl that weakens the enemy.",       type: "beast", tier: "special",   damageMult: 1.6,  energyCost: 20, effect: "atk_down" },
    { name: "Predator Pounce",description: "Leaps across the arena with crushing force.",     type: "beast", tier: "special",   damageMult: 2.1,  energyCost: 26 },
    { name: "Blood Frenzy",   description: "Enters primal rage, trading defense for power.",  type: "beast", tier: "signature", damageMult: 2.8,  energyCost: 42, effect: "berserk" },
    { name: "Apex Rend",      description: "Tears through any defense like paper.",           type: "beast", tier: "signature", damageMult: 2.6,  energyCost: 40, effect: "armor_pierce" },
    { name: "Primal Surge",   description: "Channels millions of years of evolution.",        type: "beast", tier: "signature", damageMult: 3.0,  energyCost: 48, effect: "true_damage" },
    { name: "Shadow Pounce",  description: "Leaps from shadows for a devastating ambush.",    type: "beast", tier: "special",   damageMult: 2.2,  energyCost: 28, effect: "crit_boost" },
  ],
};

const RARITY_BONUS: Record<string, number> = {
  common:    0,
  uncommon:  0.05,
  rare:      0.10,
  epic:      0.20,
  legendary: 0.30,
  mythic:    0.40,
  ancient:   0.45,
  celestial: 0.60,
};

export function generateAttacks(realm: string, rarity: string, seed: number): Attack[] {
  const r = seededRng(seed * 9999991 + 7);
  const pool    = ATTACKS_BY_REALM[realm] ?? ATTACKS_BY_REALM["balance"]!;
  const bonus   = RARITY_BONUS[rarity.toLowerCase()] ?? 0;
  const rarityN = ["common","uncommon","rare","epic","legendary","mythic","ancient","celestial"]
    .indexOf(rarity.toLowerCase());

  const basics   = pool.filter(a => a.tier === "basic");
  const specials = pool.filter(a => a.tier === "special");
  const sigs     = pool.filter(a => a.tier === "signature");

  const withBonus = (a: Attack): Attack => ({
    ...a,
    damageMult: Math.round((a.damageMult + bonus) * 100) / 100,
  });

  const basic   = r.pick(basics);
  const special = r.pick(specials);
  const sig     = sigs.length ? r.pick(sigs) : r.pick(specials);
  const sig2    = sigs.length > 1 ? r.pick(sigs) : r.pick(specials);

  if (rarityN < 2) return [withBonus(basic), withBonus(special)];
  if (rarityN < 4) return [withBonus(basic), withBonus(special), withBonus(sig)];
  return [withBonus(basic), withBonus(r.pick(specials)), withBonus(sig), withBonus(sig2)];
}
