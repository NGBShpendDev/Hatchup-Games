import type { Hatchling, Player } from "@workspace/db";

// ── Elemental advantage map ────────────────────────────────────────────────
// Strength > Balance > Cardio > Beast > Strength (rock-paper-scissors cycle)
const ADVANTAGE: Record<string, string> = {
  strength: "balance",
  balance: "cardio",
  cardio: "beast",
  beast: "strength",
};

export function getElementalMod(attackerRealm: string, defenderRealm: string): number {
  if (ADVANTAGE[attackerRealm] === defenderRealm) return 1.5;
  if (ADVANTAGE[defenderRealm] === attackerRealm) return 0.75;
  return 1;
}

// ── Move definitions ──────────────────────────────────────────────────────
export type MoveType = "basic_attack" | "special_move" | "defend" | "use_item";

export interface MoveResult {
  move: MoveType;
  damage: number;
  healing: number;
  isDefend: boolean;
  isCrit: boolean;
  isSuper: boolean;
  energyCost: number;
}

export interface TurnResult {
  turnNumber: number;
  actingSlot: 1 | 2;
  move: MoveType;
  damage: number;
  healing: number;
  isCrit: boolean;
  isSuper: boolean;
  p1HpAfter: number;
  p2HpAfter: number;
  p1EnergyAfter: number;
  p2EnergyAfter: number;
}

// ── Artifact slot info (for display and effects) ──────────────────────────
export interface EquippedArtifactSlot {
  id: number;
  name: string;
  rarity: string;
  imageSlug: string;
  slot: "major" | "minor";
  isPowered: boolean;   // false = fitness-streak not met (dormant)
  evolutionStage: number;
}

// ── Fighter state ─────────────────────────────────────────────────────────
export interface FighterState {
  playerId: number;  // 0 = bot
  hatchlingId: number;
  hatchlingName: string;
  hatchlingLevel: number;
  realm: string;
  maxHp: number;
  currentHp: number;
  maxEnergy: number;
  energy: number;
  speed: number;
  defenseBonus: number;   // flat damage reduction while defending
  specialCooldown: number; // turns remaining before special available again
  itemUsed: boolean;
  isBot: boolean;
  equippedArtifacts: EquippedArtifactSlot[];
  artifactPowerScore: number;
}

export interface BattleState {
  battleId: number;
  mode: "casual" | "ranked";
  fighter1: FighterState;
  fighter2: FighterState;
  currentSlot: 1 | 2;  // whose turn it is
  turnNumber: number;   // 0-based total turns elapsed
  phase: "lobby" | "active" | "ended";
  winner: 0 | 1 | 2 | null;  // slot that won (1 or 2), 0 = draw, null = ongoing
  turns: TurnResult[];
}

// ── Stat derivation ──────────────────────────────────────────────────────
export interface ArtifactModifiers {
  hpBonus: number;
  speedBonus: number;
  energyBonus: number;
  powerScore: number;
  equippedArtifacts: EquippedArtifactSlot[];
}

export function buildFighter(
  player: Player | null,
  hatchling: Hatchling,
  isBot = false,
  artifactMods?: ArtifactModifiers,
): FighterState {
  const level = hatchling.level ?? 1;
  const fitnessXp = player?.fitnessXp ?? 0;
  const totalSteps = player?.totalSteps ?? 0;

  const baseHp     = 100 + level * 5;
  const baseEnergy = Math.min(120, 60 + Math.floor(fitnessXp / 50));
  const baseSpeed  = Math.min(50, 10 + Math.floor(totalSteps / 2000));

  const maxHp     = baseHp     + (artifactMods?.hpBonus     ?? 0);
  const maxEnergy = baseEnergy + (artifactMods?.energyBonus ?? 0);
  const speed     = Math.min(70, baseSpeed + (artifactMods?.speedBonus ?? 0));

  return {
    playerId: player?.id ?? 0,
    hatchlingId: hatchling.id,
    hatchlingName: hatchling.name,
    hatchlingLevel: level,
    realm: hatchling.realm ?? "balance",
    maxHp,
    currentHp: maxHp,
    maxEnergy,
    energy: maxEnergy,
    speed,
    defenseBonus: 0,
    specialCooldown: 0,
    itemUsed: false,
    isBot,
    equippedArtifacts: artifactMods?.equippedArtifacts ?? [],
    artifactPowerScore: artifactMods?.powerScore ?? 0,
  };
}

// ── Bot fighter (no real player) ─────────────────────────────────────────
export function buildBotFighter(level: number): FighterState {
  const realms = ["strength", "cardio", "balance", "beast"];
  const realm = realms[Math.floor(Math.random() * realms.length)]!;
  const botNames = ["ShadowClaw", "IronFang", "TurboScales", "NeonWisp", "BlazeTail"];
  return {
    playerId: 0,
    hatchlingId: 0,
    hatchlingName: botNames[Math.floor(Math.random() * botNames.length)]!,
    hatchlingLevel: level,
    realm,
    maxHp: 100 + level * 5,
    currentHp: 100 + level * 5,
    maxEnergy: 80,
    energy: 80,
    speed: 20,
    defenseBonus: 0,
    specialCooldown: 0,
    itemUsed: false,
    isBot: true,
    equippedArtifacts: [],
    artifactPowerScore: 0,
  };
}

// ── Damage calculation ───────────────────────────────────────────────────
function calcDamage(
  attacker: FighterState,
  defender: FighterState,
  player: Player | null,
  move: MoveType,
): MoveResult {
  const level = attacker.hatchlingLevel;
  const totalWorkouts = player?.totalWorkouts ?? 0;
  const currentStreak = player?.currentStreak ?? 0;

  const baseDamage = 12 + level * 2;
  const attackFactor = 1 + Math.min(0.5, totalWorkouts / 400);
  const critRoll = Math.random() < Math.min(0.25, currentStreak * 0.01);
  const elementalMod = getElementalMod(attacker.realm, defender.realm);

  const isDefend = move === "defend";
  const isItem = move === "use_item";

  let damage = 0;
  let healing = 0;
  let energyCost = 0;

  if (isDefend) {
    energyCost = 12;
    // no damage output
  } else if (isItem) {
    energyCost = 20;
    healing = Math.round(attacker.maxHp * 0.3);
  } else if (move === "special_move") {
    energyCost = 25;
    const rawDamage = baseDamage * 2.2 * attackFactor * elementalMod * (critRoll ? 1.5 : 1);
    damage = Math.round(Math.max(1, rawDamage - defender.defenseBonus));
  } else {
    // basic_attack
    energyCost = 10;
    const rawDamage = baseDamage * attackFactor * elementalMod * (critRoll ? 1.5 : 1);
    damage = Math.round(Math.max(1, rawDamage - defender.defenseBonus));
  }

  return {
    move,
    damage,
    healing,
    isDefend,
    isCrit: critRoll && !isDefend && !isItem,
    isSuper: elementalMod > 1 && !isDefend && !isItem && damage > 0,
    energyCost,
  };
}

// ── Bot move selection ───────────────────────────────────────────────────
export function chooseBotMove(bot: FighterState): MoveType {
  const hpPct = bot.currentHp / bot.maxHp;
  if (hpPct < 0.3 && !bot.itemUsed && bot.energy >= 20) return "use_item";
  if (bot.energy >= 25 && bot.specialCooldown === 0) return "special_move";
  if (hpPct < 0.5 && bot.energy >= 12) return "defend";
  return "basic_attack";
}

// ── Validate and apply a move ────────────────────────────────────────────
export interface MoveValidationError { error: string }

export function applyMove(
  state: BattleState,
  actingSlot: 1 | 2,
  move: MoveType,
  actingPlayer: Player | null,
): MoveValidationError | BattleState {
  if (state.phase !== "active") return { error: "Battle not active" };
  if (state.currentSlot !== actingSlot) return { error: "Not your turn" };

  const attacker = actingSlot === 1 ? state.fighter1 : state.fighter2;
  const defender = actingSlot === 1 ? state.fighter2 : state.fighter1;

  // Validate move availability
  if (move === "special_move" && attacker.specialCooldown > 0) return { error: "Special move on cooldown" };
  if (move === "use_item" && attacker.itemUsed) return { error: "Item already used" };

  // Energy check (skip for basic_attack if low energy — allow always)
  const minEnergy: Record<MoveType, number> = {
    basic_attack: 0,
    special_move: 25,
    defend: 12,
    use_item: 20,
  };
  if (attacker.energy < minEnergy[move]) return { error: "Not enough energy" };

  const result = calcDamage(attacker, defender, actingPlayer, move);

  // Apply
  const newAttacker = { ...attacker };
  const newDefender = { ...defender };

  newAttacker.energy = Math.max(0, attacker.energy - result.energyCost);
  newAttacker.energy = Math.min(newAttacker.maxEnergy, newAttacker.energy + 8); // passive regen each turn

  if (result.isDefend) {
    newAttacker.defenseBonus = Math.round(attacker.maxHp * 0.15);
  } else {
    newAttacker.defenseBonus = 0; // defense resets after acting
  }

  if (result.healing > 0) {
    newAttacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + result.healing);
    newAttacker.itemUsed = true;
  }

  if (result.damage > 0) {
    newDefender.currentHp = Math.max(0, defender.currentHp - result.damage);
    newDefender.defenseBonus = 0; // defender's defense consumed on hit
  }

  if (move === "special_move") newAttacker.specialCooldown = 3;
  if (attacker.specialCooldown > 0) newAttacker.specialCooldown = attacker.specialCooldown - 1;

  const newF1 = actingSlot === 1 ? newAttacker : newDefender;
  const newF2 = actingSlot === 1 ? newDefender : newAttacker;

  const turnRecord: TurnResult = {
    turnNumber: state.turnNumber + 1,
    actingSlot,
    move,
    damage: result.damage,
    healing: result.healing,
    isCrit: result.isCrit,
    isSuper: result.isSuper,
    p1HpAfter: newF1.currentHp,
    p2HpAfter: newF2.currentHp,
    p1EnergyAfter: newF1.energy,
    p2EnergyAfter: newF2.energy,
  };

  const nextSlot: 1 | 2 = actingSlot === 1 ? 2 : 1;
  const newTurnNumber = state.turnNumber + 1;
  const MAX_TURNS = 20; // 10 per player

  // Check win conditions
  let phase: BattleState["phase"] = "active";
  let winner: BattleState["winner"] = null;

  // Explicit slot identity: newF1 is always slot-1 fighter, newF2 always slot-2.
  // Check by identity, not actingSlot, so KO attribution is always correct.
  if (newF1.currentHp <= 0) {
    phase = "ended";
    winner = 2;
  } else if (newF2.currentHp <= 0) {
    phase = "ended";
    winner = 1;
  } else if (newTurnNumber >= MAX_TURNS) {
    phase = "ended";
    winner = newF1.currentHp > newF2.currentHp ? 1 : newF1.currentHp < newF2.currentHp ? 2 : 0;
  }

  return {
    ...state,
    fighter1: newF1,
    fighter2: newF2,
    currentSlot: phase === "active" ? nextSlot : state.currentSlot,
    turnNumber: newTurnNumber,
    phase,
    winner,
    turns: [...state.turns, turnRecord],
  };
}

// ── ELO update ──────────────────────────────────────────────────────────
export function computeEloChange(winnerElo: number, loserElo: number): number {
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const k = 32;
  return Math.round(k * (1 - expected));
}

// ── Reward calculation ───────────────────────────────────────────────────
export function computeRewards(state: BattleState, playerSlot: 1 | 2): { xp: number; coins: number } {
  const won = state.winner === playerSlot;
  const turnsPlayed = state.turnNumber;
  const xp = won ? 200 + turnsPlayed * 5 : 60 + turnsPlayed * 3;
  const coins = won ? 80 : 25;
  return { xp, coins };
}
