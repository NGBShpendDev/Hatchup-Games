import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BattleWsClientMessageSchema,
  BattleWsServerMessageSchema,
} from "@workspace/api-zod";

function makeFighter() {
  return {
    playerId: 1,
    playerUsername: "DragonMaster",
    playerDisplayName: "Dragon",
    hatchlingId: 10,
    hatchlingName: "Sparky",
    hatchlingLevel: 5,
    realm: "fire",
    maxHp: 100,
    currentHp: 80,
    maxEnergy: 50,
    energy: 30,
    speed: 12,
    defenseBonus: 0,
    specialCooldown: 0,
    itemUsed: false,
    isBot: false,
    equippedArtifacts: [
      {
        id: 99,
        name: "Ember Charm",
        rarity: "rare",
        imageSlug: "ember-charm",
        slot: "major" as const,
        isPowered: true,
        evolutionStage: 2,
      },
    ],
    artifactPowerScore: 42,
  };
}

function makeBotFighter() {
  return {
    ...makeFighter(),
    playerId: 0,
    playerUsername: null,
    playerDisplayName: null,
    isBot: true,
    equippedArtifacts: [],
    artifactPowerScore: 0,
  };
}

function makeState() {
  return {
    battleId: 7,
    mode: "casual" as const,
    fighter1: makeFighter(),
    fighter2: makeBotFighter(),
    currentSlot: 1 as const,
    turnNumber: 1,
    phase: "active" as const,
    winner: null,
    turns: [
      {
        turnNumber: 1,
        actingSlot: 1 as const,
        move: "basic_attack" as const,
        damage: 12,
        healing: 0,
        isCrit: false,
        isSuper: false,
        p1HpAfter: 100,
        p2HpAfter: 88,
        p1EnergyAfter: 25,
        p2EnergyAfter: 50,
      },
    ],
  };
}

describe("BattleWsServerMessageSchema", () => {
  it("accepts queue_joined", () => {
    const r = BattleWsServerMessageSchema.safeParse({
      type: "queue_joined",
      position: 1,
      mode: "casual",
      rematchInviteId: null,
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("accepts queue_joined with rematchInviteId set", () => {
    const r = BattleWsServerMessageSchema.safeParse({
      type: "queue_joined",
      position: 2,
      mode: "ranked",
      rematchInviteId: "abc-123",
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("accepts queue_left", () => {
    const r = BattleWsServerMessageSchema.safeParse({ type: "queue_left" });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("accepts battle_start", () => {
    const state = makeState();
    const r = BattleWsServerMessageSchema.safeParse({
      type: "battle_start",
      battleId: state.battleId,
      slot1PlayerId: 1,
      slot2PlayerId: 0,
      state,
      yourSlot: 1,
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("accepts battle_state", () => {
    const r = BattleWsServerMessageSchema.safeParse({
      type: "battle_state",
      battleId: 7,
      state: makeState(),
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("accepts battle_end", () => {
    const state = { ...makeState(), phase: "ended" as const, winner: 1 as const };
    const r = BattleWsServerMessageSchema.safeParse({
      type: "battle_end",
      battleId: 7,
      winner: 1,
      rewards: { xp: 100, coins: 25 },
      eloChange: 12,
      artifactXp: [{ artifactId: 99, newStage: 2, xpGained: 50 }],
      state,
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("accepts battle_end with draw and empty artifact xp", () => {
    const state = { ...makeState(), phase: "ended" as const, winner: 0 as const };
    const r = BattleWsServerMessageSchema.safeParse({
      type: "battle_end",
      battleId: 7,
      winner: 0,
      rewards: { xp: 0, coins: 0 },
      eloChange: 0,
      artifactXp: [],
      state,
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("accepts reconnected", () => {
    const r = BattleWsServerMessageSchema.safeParse({
      type: "reconnected",
      battleId: 7,
      yourSlot: 2,
      state: makeState(),
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("accepts error (plain message)", () => {
    const r = BattleWsServerMessageSchema.safeParse({
      type: "error",
      message: "Battle not found",
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("accepts error with cap code", () => {
    const r = BattleWsServerMessageSchema.safeParse({
      type: "error",
      message: "Daily battle cap reached",
      error: "battle_daily_cap_reached",
      cap: 5,
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("rejects unknown server message type", () => {
    const r = BattleWsServerMessageSchema.safeParse({ type: "totally_made_up" });
    assert.equal(r.success, false);
  });

  it("rejects battle_start missing required fields", () => {
    const r = BattleWsServerMessageSchema.safeParse({
      type: "battle_start",
      battleId: 7,
    });
    assert.equal(r.success, false);
  });

  it("rejects queue_joined with wrong mode", () => {
    const r = BattleWsServerMessageSchema.safeParse({
      type: "queue_joined",
      position: 1,
      mode: "tournament",
      rematchInviteId: null,
    });
    assert.equal(r.success, false);
  });
});

describe("BattleWsClientMessageSchema", () => {
  it("round-trips join_queue (casual)", () => {
    const msg = { type: "join_queue", hatchlingId: 10, mode: "casual" };
    const r = BattleWsClientMessageSchema.safeParse(msg);
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("round-trips join_queue (ranked) with rematchInviteId", () => {
    const msg = {
      type: "join_queue",
      hatchlingId: 10,
      mode: "ranked",
      rematchInviteId: "abc-123",
    };
    const r = BattleWsClientMessageSchema.safeParse(msg);
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("round-trips leave_queue", () => {
    const r = BattleWsClientMessageSchema.safeParse({ type: "leave_queue" });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("round-trips player_move for every move enum", () => {
    for (const move of ["basic_attack", "special_move", "defend", "use_item"] as const) {
      const r = BattleWsClientMessageSchema.safeParse({
        type: "player_move",
        battleId: 7,
        move,
      });
      assert.ok(r.success, `${move}: ${JSON.stringify(r.error?.issues)}`);
    }
  });

  it("round-trips reconnect", () => {
    const r = BattleWsClientMessageSchema.safeParse({ type: "reconnect" });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
  });

  it("rejects unknown client message type", () => {
    const r = BattleWsClientMessageSchema.safeParse({ type: "surrender" });
    assert.equal(r.success, false);
  });

  it("rejects join_queue missing hatchlingId", () => {
    const r = BattleWsClientMessageSchema.safeParse({
      type: "join_queue",
      mode: "casual",
    });
    assert.equal(r.success, false);
  });

  it("rejects player_move missing battleId", () => {
    const r = BattleWsClientMessageSchema.safeParse({
      type: "player_move",
      move: "basic_attack",
    });
    assert.equal(r.success, false);
  });

  it("rejects player_move with invalid move", () => {
    const r = BattleWsClientMessageSchema.safeParse({
      type: "player_move",
      battleId: 7,
      move: "mega_blast",
    });
    assert.equal(r.success, false);
  });
});
