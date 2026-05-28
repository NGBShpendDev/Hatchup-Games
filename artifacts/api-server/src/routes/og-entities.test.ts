import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import {
  createPlayerOgRouter,
  createClubOgRouter,
} from "./og-router.ts";
import {
  renderPlayerOgHtml,
  renderClubOgHtml,
  buildPlayerOgSvg,
  buildClubOgSvg,
  type OgPlayerInput,
  type OgClubInput,
} from "./og-render.ts";

const BASE_URL = "https://hatchup.example.com";

function basicPlayer(overrides: Partial<OgPlayerInput> = {}): OgPlayerInput {
  return {
    id: 42,
    username: "dragon",
    displayName: "DragonMaster",
    avatarUrl: null,
    level: 17,
    rank: "Gold",
    title: "Streak Champion",
    totalSteps: 124_500,
    currentStreak: 21,
    isVerified: true,
    ...overrides,
  };
}

function basicClub(overrides: Partial<OgClubInput> = {}): OgClubInput {
  return {
    id: 9,
    name: "Iron Hatchers",
    description: "A friendly fitness club for early risers.",
    emblem: null,
    memberCount: 32,
    maxMembers: 50,
    level: 7,
    totalWins: 188,
    ...overrides,
  };
}

describe("renderPlayerOgHtml — branded share card meta", () => {
  it("includes the full set of og + twitter meta tags pointing at /player/:username/og.png", () => {
    const html = renderPlayerOgHtml({
      baseUrl: BASE_URL,
      username: "dragon",
      player: basicPlayer(),
    });
    assert.match(html, /<meta property="og:title" content="DragonMaster — Level 17 on HatchUp"/);
    assert.match(html, /<meta property="og:description" content="[^"]*Level 17[^"]*Gold[^"]*"/);
    assert.match(html, /<meta property="og:image" content="https:\/\/hatchup\.example\.com\/player\/dragon\/og\.png"/);
    assert.match(html, /<meta property="og:url" content="https:\/\/hatchup\.example\.com\/player\/dragon"/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
    assert.match(html, /<meta name="twitter:image" content="https:\/\/hatchup\.example\.com\/player\/dragon\/og\.png"/);
    assert.match(html, /<meta property="og:image:width" content="1200"/);
    assert.match(html, /<meta property="og:image:height" content="630"/);
  });

  it("bounces browsers to the SPA /players/:id route via meta refresh", () => {
    const html = renderPlayerOgHtml({
      baseUrl: BASE_URL,
      username: "dragon",
      player: basicPlayer({ id: 99 }),
    });
    assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/hatchup\.example\.com\/players\/99"/);
  });

  it("falls back to neutral preview + opengraph.jpg when the player is unknown", () => {
    const html = renderPlayerOgHtml({
      baseUrl: BASE_URL,
      username: "ghost",
      player: null,
    });
    assert.match(html, /og:title" content="HatchUp"/);
    assert.match(html, /og:image" content="https:\/\/hatchup\.example\.com\/opengraph\.jpg"/);
    assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/hatchup\.example\.com\/"/);
  });

  it("escapes HTML-sensitive characters in display name", () => {
    const html = renderPlayerOgHtml({
      baseUrl: BASE_URL,
      username: "tables",
      player: basicPlayer({ displayName: `Bobby <Tables>` }),
    });
    assert.ok(!html.includes("Bobby <Tables>"));
    assert.match(html, /Bobby &lt;Tables&gt;/);
  });
});

describe("renderClubOgHtml — branded share card meta", () => {
  it("includes og + twitter meta tags pointing at /club/:id/og.png", () => {
    const html = renderClubOgHtml({ baseUrl: BASE_URL, id: 9, club: basicClub() });
    assert.match(html, /<meta property="og:title" content="Iron Hatchers — HatchUp Club"/);
    assert.match(html, /<meta property="og:description" content="[^"]*Level 7[^"]*32 members[^"]*"/);
    assert.match(html, /<meta property="og:image" content="https:\/\/hatchup\.example\.com\/club\/9\/og\.png"/);
    assert.match(html, /<meta property="og:url" content="https:\/\/hatchup\.example\.com\/club\/9"/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
    assert.match(html, /<meta property="og:image:width" content="1200"/);
    assert.match(html, /<meta property="og:image:height" content="630"/);
  });

  it("bounces browsers to the SPA /clubs/:id route via meta refresh", () => {
    const html = renderClubOgHtml({ baseUrl: BASE_URL, id: 9, club: basicClub() });
    assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/hatchup\.example\.com\/clubs\/9"/);
  });

  it("falls back to neutral preview when the club is unknown", () => {
    const html = renderClubOgHtml({ baseUrl: BASE_URL, id: 999, club: null });
    assert.match(html, /og:title" content="HatchUp"/);
    assert.match(html, /og:image" content="https:\/\/hatchup\.example\.com\/opengraph\.jpg"/);
  });
});

describe("buildPlayerOgSvg / buildClubOgSvg — branded SVG output", () => {
  it("renders a 1200x630 SVG that includes the HATCHUP brand mark and the player's key stats", () => {
    const svg = buildPlayerOgSvg({
      displayName: "DragonMaster",
      username: "dragon",
      level: 17,
      rank: "Gold",
      title: "Streak Champion",
      totalSteps: 124_500,
      currentStreak: 21,
      isVerified: true,
      avatarHref: null,
    });
    assert.match(svg, /width="1200"\s+height="630"/);
    assert.ok(svg.includes("HATCHUP"));
    assert.ok(svg.includes("DragonMaster"));
    assert.ok(svg.includes("@dragon"));
    // Level/Rank/Streak stat pills
    assert.ok(svg.includes("LEVEL"));
    assert.ok(svg.includes("RANK"));
    assert.ok(svg.includes("STREAK"));
    assert.ok(svg.includes("21d"));
  });

  it("renders a 1200x630 club SVG that includes the HATCHUP brand mark and key stats", () => {
    const svg = buildClubOgSvg({
      name: "Iron Hatchers",
      description: "A friendly fitness club.",
      level: 7,
      memberCount: 32,
      maxMembers: 50,
      totalWins: 188,
      emblem: null,
    });
    assert.match(svg, /width="1200"\s+height="630"/);
    assert.ok(svg.includes("HATCHUP"));
    assert.ok(svg.includes("Iron Hatchers"));
    assert.ok(svg.includes("LEVEL"));
    assert.ok(svg.includes("MEMBERS"));
    assert.ok(svg.includes("32 / 50"));
    assert.ok(svg.includes("WINS"));
  });
});

async function startServer(handlers: {
  player?: (u: string) => Promise<OgPlayerInput | null>;
  club?: (id: number) => Promise<OgClubInput | null>;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  if (handlers.player) app.use(createPlayerOgRouter(handlers.player));
  if (handlers.club) app.use(createClubOgRouter(handlers.club));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("GET /player/:username — endpoint behaviour", () => {
  it("returns 200 HTML with meta tags pointing at the dynamic og.png", async () => {
    delete process.env.REPLIT_DOMAINS;
    const { url, close } = await startServer({
      player: async () => basicPlayer({ id: 12 }),
    });
    try {
      const res = await fetch(`${url}/player/dragon`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") ?? "", /text\/html/);
      const html = await res.text();
      assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/player\/dragon\/og\.png"/);
      assert.match(html, /<meta http-equiv="refresh" content="0; url=http:\/\/127\.0\.0\.1:\d+\/players\/12"/);
    } finally {
      await close();
    }
  });

  it("falls back to neutral HTML when the player does not exist (loader returns null)", async () => {
    delete process.env.REPLIT_DOMAINS;
    const { url, close } = await startServer({ player: async () => null });
    try {
      const res = await fetch(`${url}/player/ghost`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /og:title" content="HatchUp"/);
      assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/opengraph\.jpg"/);
    } finally {
      await close();
    }
  });

  it("returns 404 from /player/:username/og.png when the loader returns null", async () => {
    const { url, close } = await startServer({ player: async () => null });
    try {
      const res = await fetch(`${url}/player/ghost/og.png`);
      assert.equal(res.status, 404);
    } finally {
      await close();
    }
  });
});

describe("GET /club/:id — endpoint behaviour", () => {
  it("returns 200 HTML with meta tags pointing at the dynamic og.png", async () => {
    delete process.env.REPLIT_DOMAINS;
    const { url, close } = await startServer({
      club: async () => basicClub(),
    });
    try {
      const res = await fetch(`${url}/club/9`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/club\/9\/og\.png"/);
      assert.match(html, /<meta http-equiv="refresh" content="0; url=http:\/\/127\.0\.0\.1:\d+\/clubs\/9"/);
    } finally {
      await close();
    }
  });

  it("falls back to neutral HTML when the club does not exist", async () => {
    delete process.env.REPLIT_DOMAINS;
    const { url, close } = await startServer({ club: async () => null });
    try {
      const res = await fetch(`${url}/club/999`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /og:title" content="HatchUp"/);
      assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/opengraph\.jpg"/);
    } finally {
      await close();
    }
  });

  it("returns 400 from /club/:id/og.png for non-numeric ids", async () => {
    const { url, close } = await startServer({ club: async () => basicClub() });
    try {
      const res = await fetch(`${url}/club/abc/og.png`);
      assert.equal(res.status, 400);
    } finally {
      await close();
    }
  });
});
