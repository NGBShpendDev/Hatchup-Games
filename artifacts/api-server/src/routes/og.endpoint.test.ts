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

describe("GET /post/:id — endpoint behaviour", () => {
  it("returns 200 with HTML content-type and a cache header", async () => {
    fixture.setPost({
      postType: "general",
      content: "Hello world",
      mediaUrl: null,
      isFlagged: false,
    }, { displayName: "Dragon", username: "d" });

    const res = await fetch(`${baseUrl}/post/1`);
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

    const res = await fetch(`${baseUrl}/post/42`);
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

    const res = await fetch(`${baseUrl}/post/2`);
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

    const res = await fetch(`${baseUrl}/post/3`);
    const html = await res.text();
    assert.match(html, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/post\/3\/og\.png"/);
    assert.match(html, /twitter:image" content="http:\/\/127\.0\.0\.1:\d+\/post\/3\/og\.png"/);
  });

  it("falls back to /opengraph.jpg when the post does not exist", async () => {
    fixture.setPost(null, null);

    const res = await fetch(`${baseUrl}/post/999`);
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

    const res = await fetch(`${baseUrl}/post/13`);
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
      const res = await fetch(`${baseUrl}/post/77`);
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

    const notANumber = await fetch(`${baseUrl}/post/abc`);
    assert.equal(notANumber.status, 200);
    const zero = await fetch(`${baseUrl}/post/0`);
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
    await fetch(`${baseUrl}/post/123`);
    assert.equal(fixture.loaderCalls[before], 123);
  });
});
