import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RARITY_WEIGHTS,
  rarityWeight,
  rankArtifactCollectors,
  type ArtifactMeta,
  type OwnedArtifact,
} from "./artifactLeaderboard.ts";

const catalog: ArtifactMeta[] = [
  { id: 1,  rarity: "Common",    name: "Pebble"        },
  { id: 2,  rarity: "Rare",      name: "Crystal Shard" },
  { id: 3,  rarity: "Epic",      name: "Phoenix Ember" },
  { id: 4,  rarity: "Legendary", name: "Sun Crown"     },
  { id: 5,  rarity: "Mythic",    name: "Void Heart"    },
  { id: 6,  rarity: "Ancient",   name: "Eldertome"     },
  { id: 7,  rarity: "Celestial", name: "Star Forge"    },
  { id: 99, rarity: "Glitched",  name: "Bug Artifact"  }, // unknown rarity → weight 0
];

describe("RARITY_WEIGHTS", () => {
  it("maps every rarity tier to the documented weight", () => {
    assert.equal(RARITY_WEIGHTS.Common,    1);
    assert.equal(RARITY_WEIGHTS.Rare,      2);
    assert.equal(RARITY_WEIGHTS.Epic,      3);
    assert.equal(RARITY_WEIGHTS.Legendary, 4);
    assert.equal(RARITY_WEIGHTS.Mythic,    5);
    assert.equal(RARITY_WEIGHTS.Ancient,   6);
    assert.equal(RARITY_WEIGHTS.Celestial, 7);
  });

  it("preserves the strict ordering Celestial > Ancient > … > Common", () => {
    const tiers = ["Common", "Rare", "Epic", "Legendary", "Mythic", "Ancient", "Celestial"];
    for (let i = 1; i < tiers.length; i++) {
      assert.ok(RARITY_WEIGHTS[tiers[i]] > RARITY_WEIGHTS[tiers[i - 1]],
        `${tiers[i]} (${RARITY_WEIGHTS[tiers[i]]}) must outrank ${tiers[i - 1]} (${RARITY_WEIGHTS[tiers[i - 1]]})`);
    }
  });

  it("rarityWeight returns 0 for unknown rarities", () => {
    assert.equal(rarityWeight("Glitched"), 0);
    assert.equal(rarityWeight(""), 0);
  });
});

describe("rankArtifactCollectors", () => {
  it("returns an empty list when no one owns anything", () => {
    assert.deepEqual(rankArtifactCollectors([], catalog), []);
  });

  it("aggregates per-player score, count, and rarest artifact", () => {
    const owned: OwnedArtifact[] = [
      { playerId: 1, artifactId: 1 }, // Common (1)
      { playerId: 1, artifactId: 2 }, // Rare   (2)
      { playerId: 1, artifactId: 4 }, // Legendary (4) ← rarest
    ];
    const [p1] = rankArtifactCollectors(owned, catalog);
    assert.equal(p1.playerId,     1);
    assert.equal(p1.count,        3);
    assert.equal(p1.score,        1 + 2 + 4);
    assert.equal(p1.rarestWeight, 4);
    assert.equal(p1.rarestRarity, "Legendary");
    assert.equal(p1.rarestName,   "Sun Crown");
  });

  it("sorts primarily by rarity score descending", () => {
    // Player A: 1 Celestial (score 7, count 1)
    // Player B: 5 Commons   (score 5, count 5)
    // Higher score wins even though B has more artifacts.
    const owned: OwnedArtifact[] = [
      { playerId: 10, artifactId: 7 },
      ...Array.from({ length: 5 }, () => ({ playerId: 20, artifactId: 1 })),
    ];
    const ranked = rankArtifactCollectors(owned, catalog);
    assert.deepEqual(ranked.map(r => r.playerId), [10, 20]);
  });

  it("tie-breaks equal scores by total artifact count descending", () => {
    // Both score 6:
    //   Player 1: Mythic(5) + Common(1) → score 6, count 2
    //   Player 2: Epic(3)  + Epic(3)    → score 6, count 2  ← same count
    //   Player 3: Rare(2)*3            → score 6, count 3   ← more artifacts, wins tie
    const owned: OwnedArtifact[] = [
      { playerId: 1, artifactId: 5 }, { playerId: 1, artifactId: 1 },
      { playerId: 2, artifactId: 3 }, { playerId: 2, artifactId: 3 },
      { playerId: 3, artifactId: 2 }, { playerId: 3, artifactId: 2 }, { playerId: 3, artifactId: 2 },
    ];
    const ranked = rankArtifactCollectors(owned, catalog);
    assert.equal(ranked[0].playerId, 3, "highest count wins the score tie");
    // Players 1 and 2 share score+count → stable tie-break by playerId asc
    assert.deepEqual(ranked.slice(1).map(r => r.playerId), [1, 2]);
  });

  it("excludes hidden/blocked players entirely", () => {
    const owned: OwnedArtifact[] = [
      { playerId: 1, artifactId: 7 },
      { playerId: 2, artifactId: 4 },
      { playerId: 3, artifactId: 3 },
    ];
    const ranked = rankArtifactCollectors(owned, catalog, [1, 3]);
    assert.deepEqual(ranked.map(r => r.playerId), [2]);
  });

  it("ignores unknown artifact ids and treats unknown rarities as zero", () => {
    const owned: OwnedArtifact[] = [
      { playerId: 1, artifactId: 999 }, // not in catalog → ignored, no row created
      { playerId: 2, artifactId: 99  }, // unknown rarity → counted, score 0
      { playerId: 2, artifactId: 1   }, // Common → +1
    ];
    const ranked = rankArtifactCollectors(owned, catalog);
    assert.equal(ranked.length, 1, "player 1 contributed only an unknown artifact and has no row");
    assert.equal(ranked[0].playerId, 2);
    assert.equal(ranked[0].count, 2);
    assert.equal(ranked[0].score, 1);
  });

  it("tracks the single rarest artifact per player (first highest-weight wins)", () => {
    const owned: OwnedArtifact[] = [
      { playerId: 1, artifactId: 4 }, // Legendary (4) ← first highest
      { playerId: 1, artifactId: 3 }, // Epic (3)
      { playerId: 1, artifactId: 4 }, // Legendary again, not strictly greater
    ];
    const [p] = rankArtifactCollectors(owned, catalog);
    assert.equal(p.rarestRarity, "Legendary");
    assert.equal(p.rarestName,   "Sun Crown");
    assert.equal(p.rarestWeight, 4);
  });
});
