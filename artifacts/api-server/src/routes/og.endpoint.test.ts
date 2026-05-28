import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createOgRouter, type OgLoadResult } from "./og-router.ts";
import type { OgPostInput, OgAuthorInput } from "./og-render.ts";

interface Fixture {
  loader: (id: number) => Promise<OgLoadResult>;
  loaderCalls: number[];
  loaderError: Error | null;
  setPost: (post: OgPostInput | null, author?: OgAuthorInput | null) => void;
}

function buildFixture(): Fixture {
  let nextPost: OgPostInput | null = null;
  let nextAuthor: OgAuthorInput | null = null;
  const f: Fixture = {
    loaderCalls: [],
    loaderError: null,
    setPost(post, author = null) {
      nextPost = post;
      nextAuthor = author;
    },
    async loader(id: number) {
      f.loaderCalls.push(id);
      if (f.loaderError) throw f.loaderError;
      return { post: nextPost, author: nextAuthor };
    },
  };
  return f;
}

async function startServer(fixture: Fixture): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(createOgRouter(fixture.loader));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let fixture: Fixture;
let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  // Force getBaseUrl() to use the request's host header instead of REPLIT_DOMAINS
  // so we can assert canonical URLs against the local test server.
  delete process.env.REPLIT_DOMAINS;
  fixture = buildFixture();
  const started = await startServer(fixture);
  baseUrl = started.url;
  closeServer = started.close;
});

after(async () => {
  await closeServer();
});

// Crawler UA that triggers the OG HTML response. Most asserts below use this
// so they exercise the meta-tag path; browser-UA behaviour has its own block.
const CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

describe("GET /post/:id — endpoint behaviour", () => {
  it("returns 200 with HTML content-type and a cache header", async () => {
    fixture.setPost({
      postType: "general",
      content: "Hello world",
      mediaUrl: null,
      isFlagged: false,
    }, { displayName: "Dragon", username: "d" });

    const res = await fetch(`${baseUrl}/post/1`, { headers: { "user-agent": CRAWLER_UA } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    assert.match(res.headers.get("cache-control") ?? "", /max-age=\d+/);
  });

  it("renders all required Open Graph + Twitter Card meta tags", async () => {
    fixture.setPost({
      postType: "gym_selfie",
      content: "Crushed leg day!",
      mediaUrl: null,
      isFlagged: false,
    }, { displayName: "Dragon", username: "d" });

    const res = await fetch(`${baseUrl}/post/42`, { headers: { "user-agent": CRAWLER_UA } });
    const html = await res.text();

    assert.match(html, /<meta property="og:title" content="[^"]+"/);
    assert.match(html, /<meta property="og:description" content="[^"]+"/);
    assert.match(html, /<meta property="og:image" content="[^"]+"/);
    assert.match(html, /<meta property="og:url" content="[^"]*\/post\/42"/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
    assert.match(html, /<meta name="twitter:title" content="[^"]+"/);
    assert.match(html, /<meta name="twitter:description" content="[^"]+"/);
    assert.match(html, /<meta name="twitter:image" content="[^"]+"/);
  });

  it("uses the post's mediaUrl as the og:image when present", async () => {
    fixture.setPost({
      postType: "gym_selfie",
      content: "Pic post",
      mediaUrl: "https://cdn.example.com/leg-day.jpg",
      isFlagged: false,
    }, { displayName: "Dragon", username: "d" });

    const res = await fetch(`${baseUrl}/post/2`, { headers: { "user-agent": CRAWLER_UA } });
    const html = await res.text();
    assert.match(html, /og:image" content="https:\/\/cdn\.example\.com\/leg-day\.jpg"/);
    assert.match(html, /twitter:image" content="https:\/\/cdn\.example\.com\/leg-day\.jpg"/);
    assert.doesNotMatch(html, /opengraph\.jpg/);
  });

  it("points at /post/:id/og.png when mediaUrl is missing", async () => {
    fixture.setPost({
      postType: "general",
      content: "Text-only",
      mediaUrl: null,
      isFlagged: false,
    }, { displayName: "Dragon", username: "d" });

    const res = await fetch(`${baseUrl}/post/3`, { headers: { "user-agent": CRAWLER_UA } });
    const html = await res.text();
    assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/post\/3\/og\.png"/);
    assert.match(html, /twitter:image" content="http:\/\/127\.0\.0\.1:\d+\/post\/3\/og\.png"/);
  });

  it("falls back to /opengraph.jpg when the post does not exist", async () => {
    fixture.setPost(null, null);

    const res = await fetch(`${baseUrl}/post/999`, { headers: { "user-agent": CRAWLER_UA } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/opengraph\.jpg"/);
    assert.match(html, /og:title" content="HatchUp"/);
  });

  it("does not leak flagged-post content into the preview", async () => {
    const sensitive = "SECRET-FLAGGED-CONTENT-ABC123";
    fixture.setPost({
      postType: "general",
      content: sensitive,
      mediaUrl: "https://cdn.example.com/leak.jpg",
      isFlagged: true,
    }, { displayName: "Reported User", username: "reported" });

    const res = await fetch(`${baseUrl}/post/13`, { headers: { "user-agent": CRAWLER_UA } });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(!html.includes(sensitive), "flagged content must not appear in HTML");
    assert.ok(!html.includes("leak.jpg"), "flagged media must not be used as og:image");
    assert.ok(!html.includes("Reported User"), "flagged author must not appear");
    assert.match(html, /og:title" content="HatchUp"/);
    assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/opengraph\.jpg"/);
  });

  it("falls back to the neutral default if the loader throws", async () => {
    fixture.loaderError = new Error("db is down");
    try {
      const res = await fetch(`${baseUrl}/post/77`, { headers: { "user-agent": CRAWLER_UA } });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /og:title" content="HatchUp"/);
      assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/opengraph\.jpg"/);
    } finally {
      fixture.loaderError = null;
    }
  });

  it("skips the DB lookup for non-numeric / non-positive ids", async () => {
    fixture.setPost({
      postType: "general",
      content: "should not be used",
      mediaUrl: null,
      isFlagged: false,
    });
    const before = fixture.loaderCalls.length;

    const notANumber = await fetch(`${baseUrl}/post/abc`, { headers: { "user-agent": CRAWLER_UA } });
    assert.equal(notANumber.status, 200);
    const zero = await fetch(`${baseUrl}/post/0`, { headers: { "user-agent": CRAWLER_UA } });
    assert.equal(zero.status, 200);

    assert.equal(
      fixture.loaderCalls.length,
      before,
      "loader must not be called for invalid ids",
    );
    const html = await notANumber.text();
    assert.match(html, /og:title" content="HatchUp"/);
  });

  it("passes the parsed id to the loader for valid requests", async () => {
    fixture.setPost(null, null);
    const before = fixture.loaderCalls.length;
    await fetch(`${baseUrl}/post/123`, { headers: { "user-agent": CRAWLER_UA } });
    assert.equal(fixture.loaderCalls[before], 123);
  });
});

// ── Crawler-vs-browser routing ──────────────────────────────────────────────
// Crawlers (link-unfurl bots, social previews) must receive the OG HTML with
// meta tags so WhatsApp/Slack/Discord can render a rich preview. Real
// browsers must be 302'd to the SPA's `/p/:id` route so the user actually
// lands on the post they clicked, with no flash of unfurl HTML in between.
describe("GET /post/:id — crawler vs browser routing", () => {
  const crawlerUas = [
    "facebookexternalhit/1.1",
    "Twitterbot/1.0",
    "WhatsApp/2.23.20.0 A",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Discordbot/2.0 (+https://discordapp.com)",
    "TelegramBot (like TwitterBot)",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)",
  ];

  for (const ua of crawlerUas) {
    it(`returns 200 OG HTML for crawler UA: ${ua.slice(0, 30)}…`, async () => {
      fixture.setPost({
        postType: "gym_selfie",
        content: "Hello crawlers",
        mediaUrl: null,
        isFlagged: false,
      }, { displayName: "Dragon", username: "d" });

      const res = await fetch(`${baseUrl}/post/55`, {
        headers: { "user-agent": ua },
        redirect: "manual",
      });
      assert.equal(res.status, 200, `expected 200 for UA ${ua}`);
      assert.match(res.headers.get("content-type") ?? "", /text\/html/);
      const html = await res.text();
      assert.match(html, /<meta property="og:title" content="[^"]+"/);
      assert.match(html, /<meta property="og:image" content="[^"]+"/);
      assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
    });
  }

  const browserUas = [
    // Chrome on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    // Safari on iPhone
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    // Firefox on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  ];

  for (const ua of browserUas) {
    it(`returns 302 to /p/:id for browser UA: ${ua.slice(0, 30)}…`, async () => {
      fixture.setPost({
        postType: "general",
        content: "Hello browsers",
        mediaUrl: null,
        isFlagged: false,
      }, { displayName: "Dragon", username: "d" });

      const res = await fetch(`${baseUrl}/post/99`, {
        headers: { "user-agent": ua },
        redirect: "manual",
      });
      assert.equal(res.status, 302, `expected 302 for UA ${ua}`);
      const location = res.headers.get("location") ?? "";
      assert.match(location, /\/p\/99$/, `Location header should point at /p/99, got ${location}`);
    });
  }

  it("does not run the post loader when a browser hits the route", async () => {
    fixture.setPost({
      postType: "general",
      content: "irrelevant",
      mediaUrl: null,
      isFlagged: false,
    });
    const before = fixture.loaderCalls.length;
    const res = await fetch(`${baseUrl}/post/200`, {
      headers: { "user-agent": BROWSER_UA },
      redirect: "manual",
    });
    assert.equal(res.status, 302);
    assert.equal(
      fixture.loaderCalls.length,
      before,
      "loader must be skipped for the browser-redirect path",
    );
  });

  it("redirects browsers to '/' when the id is invalid", async () => {
    const res = await fetch(`${baseUrl}/post/abc`, {
      headers: { "user-agent": BROWSER_UA },
      redirect: "manual",
    });
    assert.equal(res.status, 302);
    const location = res.headers.get("location") ?? "";
    assert.match(location, /^http:\/\/127\.0\.0\.1:\d+\/$/, `expected base URL, got ${location}`);
  });

  it("treats requests with no User-Agent as browsers (302)", async () => {
    // Most real crawlers send a UA; missing UA is more typical of curl/scripts
    // and we'd rather err on the side of redirecting than serving HTML.
    const res = await fetch(`${baseUrl}/post/300`, {
      headers: { "user-agent": "" },
      redirect: "manual",
    });
    assert.equal(res.status, 302);
  });
});
