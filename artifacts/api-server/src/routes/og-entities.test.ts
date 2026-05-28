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
  type OgHatchlingInput,
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

  it("uses the default brand pink→orange accent when no accent is provided", () => {
    const svg = buildPlayerOgSvg({
      displayName: "DragonMaster",
      username: "dragon",
      level: 17,
      rank: null,
      title: null,
      totalSteps: null,
      currentStreak: null,
      isVerified: false,
      avatarHref: null,
    });
    assert.ok(svg.includes("#ff3d8b"));
    assert.ok(svg.includes("#ff6b3d"));
  });

  it("uses the supplied accent gradient on player share cards", () => {
    const svg = buildPlayerOgSvg({
      displayName: "DragonMaster",
      username: "dragon",
      level: 17,
      rank: null,
      title: null,
      totalSteps: null,
      currentStreak: null,
      isVerified: false,
      avatarHref: null,
      accent: { from: "#3da6ff", to: "#5cf2d6" },
    });
    assert.ok(svg.includes("#3da6ff"));
    assert.ok(svg.includes("#5cf2d6"));
    assert.ok(!svg.includes("#ff3d8b"));
  });

  it("renders the active Hatchling panel with name and rarity when activeHatchling is set", () => {
    const hatchling: OgHatchlingInput = {
      name: "Sparkle",
      rarity: "Rare",
      spriteUrl: null,
    };
    const svg = buildPlayerOgSvg({
      displayName: "DragonMaster",
      username: "dragon",
      level: 17,
      rank: "Gold",
      title: null,
      totalSteps: null,
      currentStreak: 5,
      isVerified: false,
      avatarHref: null,
      activeHatchling: hatchling,
    });
    assert.match(svg, /width="1200"\s+height="630"/);
    assert.ok(svg.includes("HATCHLING"), "should contain HATCHLING label");
    assert.ok(svg.includes("Sparkle"), "should include hatchling name");
    assert.ok(svg.includes("RARE"), "should include uppercased rarity");
  });

  it("omits the Hatchling panel when activeHatchling is null (fallback)", () => {
    const svg = buildPlayerOgSvg({
      displayName: "DragonMaster",
      username: "dragon",
      level: 17,
      rank: "Gold",
      title: null,
      totalSteps: null,
      currentStreak: 5,
      isVerified: false,
      avatarHref: null,
      activeHatchling: null,
    });
    assert.ok(!svg.includes("HATCHLING"), "should not render HATCHLING label when no hatchling");
  });

  it("includes a sprite <image> when spriteUrl is an https URL", () => {
    const svg = buildPlayerOgSvg({
      displayName: "DragonMaster",
      username: "dragon",
      level: 17,
      rank: null,
      title: null,
      totalSteps: null,
      currentStreak: null,
      isVerified: false,
      avatarHref: null,
      activeHatchling: {
        name: "Blaze",
        rarity: "Epic",
        spriteUrl: "https://cdn.hatchup.app/sprites/blaze.png",
      },
    });
    assert.ok(svg.includes("https://cdn.hatchup.app/sprites/blaze.png"), "sprite href should appear");
    assert.ok(svg.includes("hatchlingClip"), "sprite clip-path should be present");
  });

  it("truncates long hatchling names gracefully", () => {
    const svg = buildPlayerOgSvg({
      displayName: "DragonMaster",
      username: "dragon",
      level: 17,
      rank: null,
      title: null,
      totalSteps: null,
      currentStreak: null,
      isVerified: false,
      avatarHref: null,
      activeHatchling: {
        name: "AVeryLongHatchlingNameThatExceedsLimit",
        rarity: "Legendary",
        spriteUrl: null,
      },
    });
    assert.ok(!svg.includes("AVeryLongHatchlingNameThatExceedsLimit"), "full name should be truncated");
    assert.ok(svg.includes("LEGENDARY"));
  });

  it("busts the ETag when the active Hatchling changes", async () => {
    delete process.env.REPLIT_DOMAINS;
    let hatchling: OgHatchlingInput | null = null;
    const { url, close } = await startServer({
      player: async () => basicPlayer({ accentId: "default", activeHatchling: hatchling }),
    });
    try {
      const first = await fetch(`${url}/player/dragon/og.png`);
      const etagNoHatchling = first.headers.get("etag");
      assert.ok(etagNoHatchling, "should have an ETag");

      hatchling = { name: "Sparkle", rarity: "Rare", spriteUrl: null };
      const second = await fetch(`${url}/player/dragon/og.png`, {
        headers: { "if-none-match": etagNoHatchling! },
      });
      assert.equal(second.status, 200, "ETag should change when hatchling is added");
      const etagWithHatchling = second.headers.get("etag");
      assert.ok(etagWithHatchling);
      assert.notEqual(etagNoHatchling, etagWithHatchling);
    } finally {
      await close();
    }
  });

  it("uses the supplied accent gradient on club share cards", () => {
    const svg = buildClubOgSvg({
      name: "Iron Hatchers",
      description: null,
      level: 7,
      memberCount: 32,
      maxMembers: 50,
      totalWins: 188,
      emblem: null,
      accent: { from: "#a855f7", to: "#ec4899" },
    });
    assert.ok(svg.includes("#a855f7"));
    assert.ok(svg.includes("#ec4899"));
    assert.ok(!svg.includes("#ff3d8b"));
  });
});

describe("player og.png — ETag includes accent color id", () => {
  it("changes the ETag when the player's accent color changes", async () => {
    delete process.env.REPLIT_DOMAINS;
    let accentId: string = "default";
    const { url, close } = await startServer({
      player: async () => basicPlayer({
        accentId,
        accent: accentId === "default"
          ? { from: "#ff3d8b", to: "#ff6b3d" }
          : { from: "#3da6ff", to: "#5cf2d6" },
      }),
    });
    try {
      const first = await fetch(`${url}/player/dragon/og.png`);
      const firstEtag = first.headers.get("etag");
      assert.ok(firstEtag, "first response should have an ETag");
      // Same accent → same ETag (cacheable)
      const cached = await fetch(`${url}/player/dragon/og.png`, {
        headers: { "if-none-match": firstEtag! },
      });
      assert.equal(cached.status, 304);
      // Different accent → ETag changes, cache busts
      accentId = "ocean";
      const second = await fetch(`${url}/player/dragon/og.png`, {
        headers: { "if-none-match": firstEtag! },
      });
      assert.equal(second.status, 200);
      const secondEtag = second.headers.get("etag");
      assert.ok(secondEtag);
      assert.notEqual(firstEtag, secondEtag);
    } finally {
      await close();
    }
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
