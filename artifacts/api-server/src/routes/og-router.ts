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
  type OgPostInput,
  type OgAuthorInput,
} from "./og-render.ts";

export interface OgLoadResult {
  post: OgPostInput | null;
  author: OgAuthorInput | null;
}

export type OgPostLoader = (id: number) => Promise<OgLoadResult>;

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

      const etag = `W/"${createHash("sha1")
        .update(`${id}|${post.postType}|${authorName}|${authorHandle}|${avatarUrl ?? ""}|${content}`)
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
