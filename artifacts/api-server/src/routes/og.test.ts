import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderOgHtml, type OgPostInput, type OgAuthorInput } from "./og-render.ts";

const BASE_URL = "https://hatchup.example.com";

function basicPost(overrides: Partial<OgPostInput> = {}): OgPostInput {
  return {
    postType: "gym_selfie",
    content: "Crushed leg day!",
    mediaUrl: null,
    isFlagged: false,
    ...overrides,
  };
}

function basicAuthor(overrides: Partial<OgAuthorInput> = {}): OgAuthorInput {
  return { displayName: "DragonMaster", username: "dragon", ...overrides };
}

describe("renderOgHtml — meta tag coverage", () => {
  it("includes og:title, og:description, og:image, and twitter:card", () => {
    const html = renderOgHtml({
      baseUrl: BASE_URL,
      id: 42,
      post: basicPost(),
      author: basicAuthor(),
    });
    assert.match(html, /<meta property="og:title" content="[^"]+"/);
    assert.match(html, /<meta property="og:description" content="[^"]+"/);
    assert.match(html, /<meta property="og:image" content="[^"]+"/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
    assert.match(html, /<meta name="twitter:title" content="[^"]+"/);
    assert.match(html, /<meta name="twitter:description" content="[^"]+"/);
    assert.match(html, /<meta name="twitter:image" content="[^"]+"/);
    assert.match(html, /<meta property="og:url" content="https:\/\/hatchup\.example\.com\/post\/42"/);
  });

  it("redirects browsers to the SPA-served /p/:id route via meta refresh", () => {
    const html = renderOgHtml({ baseUrl: BASE_URL, id: 1, post: basicPost(), author: basicAuthor() });
    assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/hatchup\.example\.com\/p\/1"/);
  });

  it("falls back to / when there is no valid post id", () => {
    const html = renderOgHtml({ baseUrl: BASE_URL, id: null, post: null, author: null });
    assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/hatchup\.example\.com\/"/);
  });

  it("includes author display name and post type tag in the title", () => {
    const html = renderOgHtml({
      baseUrl: BASE_URL,
      id: 7,
      post: basicPost({ postType: "evolution_reveal" }),
      author: basicAuthor({ displayName: "AshKetchum" }),
    });
    assert.match(html, /og:title" content="✨ Evolution Reveal — AshKetchum on HatchUp"/);
  });

  it("falls back to username and then to 'A HatchUp player' for missing names", () => {
    const usernameOnly = renderOgHtml({
      baseUrl: BASE_URL,
      id: 7,
      post: basicPost(),
      author: { displayName: null, username: "lurker" },
    });
    assert.match(usernameOnly, /— lurker on HatchUp"/);

    const anon = renderOgHtml({
      baseUrl: BASE_URL,
      id: 7,
      post: basicPost(),
      author: null,
    });
    assert.match(anon, /— A HatchUp player on HatchUp"/);
  });
});

describe("renderOgHtml — image selection", () => {
  it("uses mediaUrl when present (absolute URL passes through)", () => {
    const html = renderOgHtml({
      baseUrl: BASE_URL,
      id: 1,
      post: basicPost({ mediaUrl: "https://cdn.example.com/pic.jpg" }),
      author: basicAuthor(),
    });
    assert.match(html, /<meta property="og:image" content="https:\/\/cdn\.example\.com\/pic\.jpg"/);
    assert.match(html, /<meta name="twitter:image" content="https:\/\/cdn\.example\.com\/pic\.jpg"/);
    assert.doesNotMatch(html, /opengraph\.jpg/);
  });

  it("prefixes relative mediaUrl with the base URL", () => {
    const leading = renderOgHtml({
      baseUrl: BASE_URL,
      id: 1,
      post: basicPost({ mediaUrl: "/uploads/a.png" }),
      author: basicAuthor(),
    });
    assert.match(leading, /og:image" content="https:\/\/hatchup\.example\.com\/uploads\/a\.png"/);

    const noLeading = renderOgHtml({
      baseUrl: BASE_URL,
      id: 1,
      post: basicPost({ mediaUrl: "uploads/b.png" }),
      author: basicAuthor(),
    });
    assert.match(noLeading, /og:image" content="https:\/\/hatchup\.example\.com\/uploads\/b\.png"/);
  });

  it("points at the dynamic /post/:id/og.png when mediaUrl is missing", () => {
    const html = renderOgHtml({
      baseUrl: BASE_URL,
      id: 1,
      post: basicPost({ mediaUrl: null }),
      author: basicAuthor(),
    });
    assert.match(html, /og:image" content="https:\/\/hatchup\.example\.com\/post\/1\/og\.png"/);
    assert.match(html, /twitter:image" content="https:\/\/hatchup\.example\.com\/post\/1\/og\.png"/);
    assert.match(html, /<meta property="og:image:width" content="1200"/);
    assert.match(html, /<meta property="og:image:height" content="630"/);
  });

  it("falls back to /opengraph.jpg when there is no post (unknown id)", () => {
    const html = renderOgHtml({ baseUrl: BASE_URL, id: 999, post: null, author: null });
    assert.match(html, /og:image" content="https:\/\/hatchup\.example\.com\/opengraph\.jpg"/);
  });
});

describe("renderOgHtml — flagged posts do not leak content", () => {
  const sensitive = "SECRET-FLAGGED-CONTENT-XYZ";

  it("omits flagged post content from title, description, and image", () => {
    const html = renderOgHtml({
      baseUrl: BASE_URL,
      id: 13,
      post: basicPost({
        content: sensitive,
        mediaUrl: "https://cdn.example.com/leak.jpg",
        isFlagged: true,
      }),
      author: basicAuthor({ displayName: "Reported User" }),
    });
    assert.ok(!html.includes(sensitive), "flagged content must not appear in HTML");
    assert.ok(!html.includes("leak.jpg"), "flagged media must not be used as og:image");
    assert.ok(!html.includes("Reported User"), "flagged author must not appear in preview");
    assert.match(html, /og:title" content="HatchUp"/);
    assert.match(html, /og:image" content="https:\/\/hatchup\.example\.com\/opengraph\.jpg"/);
  });

  it("returns the neutral default preview when post is null", () => {
    const html = renderOgHtml({ baseUrl: BASE_URL, id: null, post: null, author: null });
    assert.match(html, /og:title" content="HatchUp"/);
    assert.match(
      html,
      /og:description" content="HatchUp Fitness Pals — the fitness RPG where every step hatches a creature\."/,
    );
  });
});

describe("renderOgHtml — soft-deleted posts do not leak content", () => {
  const sensitive = "SECRET-DELETED-CONTENT-DEF456";

  it("omits content from a post with deletedAt set (Date)", () => {
    const html = renderOgHtml({
      baseUrl: BASE_URL,
      id: 21,
      post: basicPost({
        content: sensitive,
        mediaUrl: "https://cdn.example.com/deleted.jpg",
        deletedAt: new Date(),
      }),
      author: basicAuthor({ displayName: "Removed Author" }),
    });
    assert.ok(!html.includes(sensitive), "deleted content must not appear in HTML");
    assert.ok(!html.includes("deleted.jpg"), "deleted media must not be used as og:image");
    assert.ok(!html.includes("Removed Author"), "deleted post's author must not appear in preview");
    assert.match(html, /og:title" content="HatchUp"/);
    assert.match(html, /og:image" content="https:\/\/hatchup\.example\.com\/opengraph\.jpg"/);
  });

  it("omits content from a post with deletedAt set (ISO string)", () => {
    const html = renderOgHtml({
      baseUrl: BASE_URL,
      id: 22,
      post: basicPost({ content: sensitive, deletedAt: "2026-05-01T12:00:00.000Z" }),
      author: basicAuthor(),
    });
    assert.ok(!html.includes(sensitive));
    assert.match(html, /og:title" content="HatchUp"/);
  });

  it("still renders normally when deletedAt is null or undefined", () => {
    const nullDeleted = renderOgHtml({
      baseUrl: BASE_URL,
      id: 23,
      post: basicPost({ content: "Still here", deletedAt: null }),
      author: basicAuthor(),
    });
    assert.match(nullDeleted, /Still here/);
    assert.doesNotMatch(nullDeleted, /og:title" content="HatchUp"\s/);

    const undef = renderOgHtml({
      baseUrl: BASE_URL,
      id: 24,
      post: basicPost({ content: "Also here" }),
      author: basicAuthor(),
    });
    assert.match(undef, /Also here/);
  });
});

describe("renderOgHtml — suspended/blocked authors do not leak content", () => {
  const sensitive = "SECRET-SUSPENDED-AUTHOR-GHI789";

  it("collapses to the neutral default when the author is suspended", () => {
    const html = renderOgHtml({
      baseUrl: BASE_URL,
      id: 31,
      post: basicPost({
        content: sensitive,
        mediaUrl: "https://cdn.example.com/banned.jpg",
      }),
      author: basicAuthor({ displayName: "Suspended Person", isSuspended: true }),
    });
    assert.ok(!html.includes(sensitive), "suspended author's post content must not appear");
    assert.ok(!html.includes("banned.jpg"), "suspended author's media must not appear");
    assert.ok(!html.includes("Suspended Person"), "suspended author name must not appear");
    assert.match(html, /og:title" content="HatchUp"/);
    assert.match(html, /og:image" content="https:\/\/hatchup\.example\.com\/opengraph\.jpg"/);
  });

  it("still renders normally when isSuspended is false / null / undefined", () => {
    for (const isSuspended of [false, null, undefined] as const) {
      const html = renderOgHtml({
        baseUrl: BASE_URL,
        id: 32,
        post: basicPost({ content: "Visible" }),
        author: basicAuthor({ displayName: "Normal User", isSuspended }),
      });
      assert.match(html, /Visible/, `isSuspended=${String(isSuspended)} should not hide post`);
      assert.match(html, /Normal User/);
    }
  });
});

describe("renderOgHtml — escaping", () => {
  it("escapes HTML-sensitive characters in post content", () => {
    const html = renderOgHtml({
      baseUrl: BASE_URL,
      id: 1,
      post: basicPost({ content: `<script>alert("xss")</script>` }),
      author: basicAuthor({ displayName: `Bobby <Tables>` }),
    });
    assert.ok(!html.includes("<script>alert"), "raw script tag must be escaped");
    assert.match(html, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
    assert.match(html, /Bobby &lt;Tables&gt;/);
  });
});
