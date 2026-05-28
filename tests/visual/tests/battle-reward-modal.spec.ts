// Tests that the post-battle RewardSummaryModal shows the correct title
// for both the winner ("Victory Rewards") and the loser ("Almost! Keep Going").
//
// Both paths are exercised by routing the WebSocket so a synthetic server
// sends battle_start (establishing yourSlot) then battle_end (winner field
// controls which modal title fires). No real server or real DB is needed —
// all HTTP routes and the WS endpoint are stubbed via page.route /
// page.routeWebSocket.
//
// Like the other tests/visual specs this one is skipped when the
// shared Clerk storage state is missing — see tests/visual/README.md
// for how to capture it.

import { test, expect, type Page, type Route } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const storageStatePath = path.resolve(
  process.env.HATCHUP_STORAGE_STATE ||
    path.join(import.meta.dirname, "..", "auth", "storageState.json"),
);

const hasAuth = existsSync(storageStatePath);
const skipReason = !hasAuth
  ? `No Clerk storage state found at ${storageStatePath}. ` +
    `See tests/visual/README.md for how to capture it before running this spec.`
  : "";

const PLAYER_ID = 1;
const HATCHLING_ID = 4242;

const STUB_HATCHLING = {
  id: HATCHLING_ID,
  playerId: PLAYER_ID,
  name: "QueueBot",
  species: "Sparkpup",
  rarity: "Common",
  realm: "balance",
  level: 5,
  happiness: 80,
  hunger: 80,
  energy: 80,
  isShiny: false,
  personality: "brave",
  genetics: {},
};

function makeFighterPayload(
  playerId: number,
  isBot: boolean,
  hatchlingId: number,
  hatchlingName: string,
) {
  return {
    playerId,
    playerUsername: isBot ? null : "TestPlayer",
    playerDisplayName: isBot ? null : "Test Player",
    hatchlingId,
    hatchlingName,
    hatchlingLevel: 5,
    realm: "balance",
    maxHp: 100,
    currentHp: isBot ? 0 : 100,
    maxEnergy: 50,
    energy: 50,
    speed: 10,
    defenseBonus: 0,
    specialCooldown: 0,
    itemUsed: false,
    isBot,
    equippedArtifacts: [] as unknown[],
    artifactPowerScore: 0,
  };
}

function makeBattleStatePayload(
  winner: 0 | 1 | 2 | null,
  phase: "lobby" | "active" | "ended",
) {
  return {
    battleId: 1,
    mode: "casual" as const,
    fighter1: makeFighterPayload(PLAYER_ID, false, HATCHLING_ID, "QueueBot"),
    fighter2: makeFighterPayload(0, true, 9999, "BotPal"),
    currentSlot: 1 as const,
    turnNumber: 1,
    phase,
    winner,
    turns: [] as unknown[],
  };
}

function makeBattleStartMsg(yourSlot: 1 | 2) {
  return {
    type: "battle_start",
    battleId: 1,
    slot1PlayerId: PLAYER_ID,
    slot2PlayerId: 0,
    yourSlot,
    state: makeBattleStatePayload(null, "active"),
  };
}

function makeBattleEndMsg(winner: 0 | 1 | 2) {
  return {
    type: "battle_end",
    battleId: 1,
    winner,
    rewards: { xp: 50, coins: 10 },
    eloChange: 0,
    artifactXp: [] as unknown[],
    state: makeBattleStatePayload(winner, "ended"),
  };
}

async function setupHttpMocks(page: Page) {
  await page.route("**/api/hatchlings**", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([STUB_HATCHLING]),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/players/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === "GET" &&
      /\/api\/players\/\d+$/.test(url.pathname)
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: PLAYER_ID, level: 5, battleElo: 1000 }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/players/me/artifacts", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.route("**/api/battles/history**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.route("**/api/battles/rivals**", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.route("**/api/battles/ws-token", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "stub-ws-token" }),
    });
  });
}

async function navigateAndEnterQueue(page: Page) {
  await page.goto("/compete/battle");
  await page.getByRole("button", { name: /QueueBot/ }).first().click();
  await page
    .getByRole("button", { name: /Equip Artifacts & Find Battle/i })
    .click();
  await page
    .getByRole("button", { name: /Skip \(no artifacts\)/i })
    .click();
}

test.describe("Battle — post-match RewardSummaryModal", () => {
  test.skip(!!skipReason, skipReason);

  test("winner path: battle_end with winner === yourSlot shows 'Victory Rewards'", async ({
    page,
  }) => {
    await setupHttpMocks(page);

    // Viewer is assigned slot 1. battle_end reports winner = 1 → viewer won.
    await page.routeWebSocket(/\/api\/ws\/battle/, (ws) => {
      ws.onMessage((raw) => {
        let parsed: { type?: string } = {};
        try {
          parsed = JSON.parse(
            typeof raw === "string" ? raw : raw.toString(),
          );
        } catch {
          // ignore non-JSON frames
        }
        if (parsed.type === "join_queue") {
          ws.send(JSON.stringify(makeBattleStartMsg(1)));
          setTimeout(() => ws.send(JSON.stringify(makeBattleEndMsg(1))), 120);
        }
      });
    });

    await navigateAndEnterQueue(page);

    await expect(
      page.getByRole("heading", { name: "Victory Rewards" }),
    ).toBeVisible({ timeout: 12_000 });
  });

  test("loser path: battle_end with winner !== yourSlot shows 'Almost! Keep Going'", async ({
    page,
  }) => {
    await setupHttpMocks(page);

    // Viewer is assigned slot 1. battle_end reports winner = 2 → viewer lost.
    await page.routeWebSocket(/\/api\/ws\/battle/, (ws) => {
      ws.onMessage((raw) => {
        let parsed: { type?: string } = {};
        try {
          parsed = JSON.parse(
            typeof raw === "string" ? raw : raw.toString(),
          );
        } catch {
          // ignore non-JSON frames
        }
        if (parsed.type === "join_queue") {
          ws.send(JSON.stringify(makeBattleStartMsg(1)));
          setTimeout(() => ws.send(JSON.stringify(makeBattleEndMsg(2))), 120);
        }
      });
    });

    await navigateAndEnterQueue(page);

    await expect(
      page.getByRole("heading", { name: "Almost! Keep Going" }),
    ).toBeVisible({ timeout: 12_000 });
  });
});
