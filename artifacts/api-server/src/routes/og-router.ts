import { Router } from "express";
import { renderOgHtml, type OgPostInput, type OgAuthorInput } from "./og-render.ts";

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

// ── GET /post/:id ───────────────────────────────────────────────────────────
// Server-rendered HTML with Open Graph + Twitter Card meta tags so links
// pasted into WhatsApp, Slack, iMessage, Discord, etc. show a rich preview.
// Browsers are redirected back into the SPA via meta refresh.
export function createOgRouter(loader: OgPostLoader): Router {
  const router = Router();
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
