import { Router } from "express";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  renderOgHtml,
  buildOgSvg,
  postTypeLabel,
  ogTruncate,
  isOgHidden,
  isOgCrawlerUserAgent,
  buildPlayerOgSvg,
  buildClubOgSvg,
  renderPlayerOgHtml,
  renderClubOgHtml,
  type OgPostInput,
  type OgAuthorInput,
  type OgPlayerInput,
  type OgClubInput,
} from "./og-render.ts";

export interface OgLoadResult {
  post: OgPostInput | null;
  author: OgAuthorInput | null;
}

export type OgPostLoader = (id: number) => Promise<OgLoadResult>;
export type OgPlayerLoader = (username: string) => Promise<OgPlayerInput | null>;
export type OgClubLoader = (id: number) => Promise<OgClubInput | null>;

function getBaseUrl(req: import("express").Request): string {
  const envDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (envDomain) return `https://${envDomain}`;
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}`;
}

// ── Font loading (lazy, cached) ──────────────────────────────────────────────
// We load Inter from @fontsource/inter and pass the files to resvg-js so it
// can rasterize text without relying on system fonts being installed.
const requireFromHere = createRequire(import.meta.url);

let fontFilesPromise: Promise<string[]> | null = null;
function getFontFiles(): Promise<string[]> {
  if (!fontFilesPromise) {
    fontFilesPromise = (async () => {
      const pkgJson = requireFromHere.resolve("@fontsource/inter/package.json");
      const fontsDir = path.join(path.dirname(pkgJson), "files");
      const candidates = [
        "inter-latin-400-normal.woff2",
        "inter-latin-700-normal.woff2",
      ];
      const resolved: string[] = [];
      for (const name of candidates) {
        const full = path.join(fontsDir, name);
        try {
          await readFile(full);
          resolved.push(full);
        } catch {
          // skip missing fonts gracefully
        }
      }
      return resolved;
    })();
  }
  return fontFilesPromise;
}

// Fetch a remote avatar to a Buffer with a short timeout. Returns null on any
// failure so rendering never hard-fails because of a slow or broken avatar.
async function fetchAvatar(url: string): Promise<Buffer | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const resp = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    // Cap at 2MB so a hostile/huge avatar can't blow up memory.
    if (buf.length > 2 * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  }
}

// ── GET /post/:id  + /post/:id/og.png ───────────────────────────────────────
// HTML route renders Open Graph + Twitter Card meta tags so links pasted into
// WhatsApp / Slack / iMessage / Discord show a rich preview. When the post
// has no mediaUrl, the meta tags point at /post/:id/og.png which renders a
// branded 1200x630 PNG on the fly.
export function createOgRouter(loader: OgPostLoader): Router {
  const router = Router();

  router.get("/post/:id/og.png", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid post id" });
      return;
    }

    try {
      const { post, author } = await loader(id);
      if (!post || isOgHidden(post, author)) {
        res.status(404).json({ error: "Post not found" });
        return;
      }

      const authorName = author?.displayName || author?.username || "HatchUp Player";
      const authorHandle = author?.username || "hatchup";
      const avatarUrl = author?.avatarUrl && /^https?:\/\//i.test(author.avatarUrl)
        ? author.avatarUrl
        : null;
      const label = postTypeLabel(post.postType);
      const content = ogTruncate(post.content || "", 240);

      const accentId = author?.accentId ?? "default";
      const etag = `W/"${createHash("sha1")
        .update(`${id}|${post.postType}|${authorName}|${authorHandle}|${avatarUrl ?? ""}|${content}|${accentId}`)
        .digest("hex")}"`;

      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }

      const svg = buildOgSvg({
        authorName,
        authorHandle,
        postTypeLabel: label,
        content,
        avatarHref: avatarUrl,
        accent: author?.accent ?? null,
      });
      const fontFiles = await getFontFiles();
      const resvg = new Resvg(svg, {
        font: {
          fontFiles,
          loadSystemFonts: false,
          defaultFontFamily: "Inter",
          sansSerifFamily: "Inter",
        },
        fitTo: { mode: "width", value: 1200 },
      });
      // Resolve any external <image> hrefs (the avatar) by fetching the
      // bytes ourselves. resvg cannot fetch URLs on its own.
      const pending = resvg.imagesToResolve();
      if (pending.length > 0) {
        await Promise.all(
          pending.map(async (href) => {
            const buf = await fetchAvatar(href);
            if (buf) {
              try { resvg.resolveImage(href, buf); } catch { /* ignore */ }
            }
          }),
        );
      }
      const png = resvg.render().asPng();

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, immutable");
      res.setHeader("ETag", etag);
      res.send(Buffer.from(png));
    } catch (err) {
      req.log?.warn({ err: (err as Error).message, postId: id }, "og.png render failed");
      res.status(500).json({ error: "Failed to render preview" });
    }
  });

  router.get("/post/:id", async (req, res) => {
    const id = Number(req.params.id);
    const baseUrl = getBaseUrl(req);
    const isCrawler = isOgCrawlerUserAgent(req.headers["user-agent"]);

    // Real browsers should never see the OG HTML — bounce them straight to
    // the SPA's /p/:id route so they land on the actual post. Only crawlers
    // and unfurl bots get the meta-tag payload.
    if (!isCrawler) {
      const target = Number.isFinite(id) && id > 0
        ? `${baseUrl}/p/${id}`
        : `${baseUrl}/`;
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, target);
      return;
    }

    let post: OgPostInput | null = null;
    let author: OgAuthorInput | null = null;

    if (Number.isFinite(id) && id > 0) {
      try {
        const result = await loader(id);
        post = result.post;
        author = result.author;
      } catch (err) {
        req.log?.warn({ err: (err as Error).message, postId: id }, "og preview lookup failed");
      }
    }

    const html = renderOgHtml({
      baseUrl,
      id: Number.isFinite(id) ? id : null,
      post,
      author,
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(html);
  });

  return router;
}

// Shared helper that rasterizes an SVG (with optional remote <image> hrefs)
// to a PNG using the cached Inter fonts. Used by every share-card endpoint
// so we never drift between post / player / club rendering.
async function renderSvgToPng(svg: string): Promise<Buffer> {
  const fontFiles = await getFontFiles();
  const resvg = new Resvg(svg, {
    font: {
      fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
      sansSerifFamily: "Inter",
    },
    fitTo: { mode: "width", value: 1200 },
  });
  const pending = resvg.imagesToResolve();
  if (pending.length > 0) {
    await Promise.all(
      pending.map(async (href) => {
        const buf = await fetchAvatar(href);
        if (buf) {
          try { resvg.resolveImage(href, buf); } catch { /* ignore */ }
        }
      }),
    );
  }
  return Buffer.from(resvg.render().asPng());
}

// ── GET /player/:username + /player/:username/og.png ────────────────────────
export function createPlayerOgRouter(loader: OgPlayerLoader): Router {
  const router = Router();

  router.get("/player/:username/og.png", async (req, res) => {
    const username = String(req.params.username || "").trim();
    if (!username) {
      res.status(400).json({ error: "Invalid username" });
      return;
    }

    try {
      const player = await loader(username);
      if (!player) {
        res.status(404).json({ error: "Player not found" });
        return;
      }

      const avatarUrl = player.avatarUrl && /^https?:\/\//i.test(player.avatarUrl)
        ? player.avatarUrl
        : null;
      const accentId = player.accentId ?? "default";
      const hatchlingKey = player.activeHatchling
        ? `${player.activeHatchling.name}|${player.activeHatchling.rarity}|${player.activeHatchling.spriteUrl ?? ""}`
        : "";
      const etag = `W/"${createHash("sha1")
        .update([
          player.id,
          player.username,
          player.displayName ?? "",
          player.level,
          player.rank ?? "",
          player.title ?? "",
          player.totalSteps ?? 0,
          player.currentStreak ?? 0,
          player.isVerified ? 1 : 0,
          avatarUrl ?? "",
          accentId,
          hatchlingKey,
        ].join("|"))
        .digest("hex")}"`;

      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }

      const svg = buildPlayerOgSvg({
        displayName: player.displayName || player.username,
        username: player.username,
        level: player.level,
        rank: player.rank ?? null,
        title: player.title ?? null,
        totalSteps: player.totalSteps ?? null,
        currentStreak: player.currentStreak ?? null,
        isVerified: !!player.isVerified,
        avatarHref: avatarUrl,
        accent: player.accent ?? null,
        activeHatchling: player.activeHatchling ?? null,
      });
      const png = await renderSvgToPng(svg);

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, immutable");
      res.setHeader("ETag", etag);
      res.send(png);
    } catch (err) {
      req.log?.warn(
        { err: (err as Error).message, username },
        "player og.png render failed",
      );
      res.status(500).json({ error: "Failed to render preview" });
    }
  });

  router.get("/player/:username", async (req, res) => {
    const username = String(req.params.username || "").trim();
    const baseUrl = getBaseUrl(req);
    let player: OgPlayerInput | null = null;
    if (username) {
      try {
        player = await loader(username);
      } catch (err) {
        req.log?.warn(
          { err: (err as Error).message, username },
          "player og preview lookup failed",
        );
      }
    }
    const html = renderPlayerOgHtml({ baseUrl, username, player });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(html);
  });

  return router;
}

// ── GET /club/:id + /club/:id/og.png ────────────────────────────────────────
export function createClubOgRouter(loader: OgClubLoader): Router {
  const router = Router();

  router.get("/club/:id/og.png", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid club id" });
      return;
    }

    try {
      const club = await loader(id);
      if (!club) {
        res.status(404).json({ error: "Club not found" });
        return;
      }

      const emblemUrl = club.emblem && /^https?:\/\//i.test(club.emblem) ? club.emblem : null;
      const accentId = club.accentId ?? "default";
      const etag = `W/"${createHash("sha1")
        .update([
          club.id,
          club.name,
          club.description ?? "",
          club.level,
          club.memberCount,
          club.maxMembers ?? 0,
          club.totalWins ?? 0,
          club.emblem ?? "",
          accentId,
        ].join("|"))
        .digest("hex")}"`;

      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }

      const svg = buildClubOgSvg({
        name: club.name,
        description: club.description ?? null,
        level: club.level,
        memberCount: club.memberCount,
        maxMembers: club.maxMembers ?? null,
        totalWins: club.totalWins ?? null,
        emblem: emblemUrl ?? (club.emblem ?? null),
        accent: club.accent ?? null,
      });
      const png = await renderSvgToPng(svg);

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, immutable");
      res.setHeader("ETag", etag);
      res.send(png);
    } catch (err) {
      req.log?.warn({ err: (err as Error).message, clubId: id }, "club og.png render failed");
      res.status(500).json({ error: "Failed to render preview" });
    }
  });

  router.get("/club/:id", async (req, res) => {
    const id = Number(req.params.id);
    const baseUrl = getBaseUrl(req);
    let club: OgClubInput | null = null;
    if (Number.isFinite(id) && id > 0) {
      try {
        club = await loader(id);
      } catch (err) {
        req.log?.warn({ err: (err as Error).message, clubId: id }, "club og preview lookup failed");
      }
    }
    const html = renderClubOgHtml({
      baseUrl,
      id: Number.isFinite(id) ? id : null,
      club,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(html);
  });

  return router;
}
