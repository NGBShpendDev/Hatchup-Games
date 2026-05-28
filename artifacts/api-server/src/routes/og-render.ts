const POST_TYPE_TAGS: Record<string, string> = {
  general: "💬 Update",
  gym_selfie: "💪 Gym Selfie",
  evolution_reveal: "✨ Evolution Reveal",
  streak_milestone: "🔥 Streak Milestone",
  transformation: "🦋 Transformation",
  workout_stat: "📊 Workout Stat",
  hatch_moment: "🥚 Hatch Moment",
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

export interface OgPostInput {
  postType: string;
  content: string;
  mediaUrl: string | null;
  isFlagged: boolean;
}

export interface OgAuthorInput {
  displayName?: string | null;
  username?: string | null;
}

export interface RenderOgArgs {
  baseUrl: string;
  id: number | null;
  post: OgPostInput | null;
  author: OgAuthorInput | null;
}

/**
 * Build the share-preview HTML for /post/:id.
 *
 * Pure function so it can be unit tested without a database. The route handler
 * is responsible for looking up `post` + `author` and passing them in.
 *
 * Flagged or missing posts collapse to the neutral default preview so we never
 * leak moderated content into WhatsApp / Slack / Discord unfurls.
 */
export function renderOgHtml({ baseUrl, id, post, author }: RenderOgArgs): string {
  const fallbackImage = `${baseUrl}/opengraph.jpg`;
  const appUrl = `${baseUrl}/`;
  const canonicalUrl = `${baseUrl}/post/${id != null && Number.isFinite(id) ? id : ""}`;

  let title = "HatchUp";
  let description = "HatchUp Fitness Pals — the fitness RPG where every step hatches a creature.";
  let imageUrl = fallbackImage;

  if (post && !post.isFlagged) {
    const authorName = author?.displayName || author?.username || "A HatchUp player";
    const tag = POST_TYPE_TAGS[post.postType] ?? POST_TYPE_TAGS.general;
    title = `${tag} — ${authorName} on HatchUp`;
    description = truncate(`${tag} · ${post.content}`, 280);
    if (post.mediaUrl) {
      imageUrl = isAbsoluteUrl(post.mediaUrl)
        ? post.mediaUrl
        : `${baseUrl}${post.mediaUrl.startsWith("/") ? "" : "/"}${post.mediaUrl}`;
    }
  }

  const safeTitle = escapeAttr(title);
  const safeDescription = escapeAttr(description);
  const safeImage = escapeAttr(imageUrl);
  const safeCanonical = escapeAttr(canonicalUrl);
  const safeAppUrl = escapeAttr(appUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${safeDescription}" />
  <link rel="canonical" href="${safeCanonical}" />

  <meta property="og:site_name" content="HatchUp" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${safeCanonical}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:alt" content="${safeTitle}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${safeImage}" />

  <meta http-equiv="refresh" content="0; url=${safeAppUrl}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0a0a0f; color: #f5f5f7; display: flex; align-items: center; justify-content: center; min-height: 100vh; text-align: center; padding: 24px; }
    a { color: #ff3d8b; }
  </style>
</head>
<body>
  <div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <p><a href="${safeAppUrl}">Open in HatchUp →</a></p>
  </div>
  <script>window.location.replace(${JSON.stringify(appUrl)});</script>
</body>
</html>`;
}
