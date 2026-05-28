const POST_TYPE_TAGS: Record<string, string> = {
  general: "💬 Update",
  gym_selfie: "💪 Gym Selfie",
  evolution_reveal: "✨ Evolution Reveal",
  streak_milestone: "🔥 Streak Milestone",
  transformation: "🦋 Transformation",
  workout_stat: "📊 Workout Stat",
  hatch_moment: "🥚 Hatch Moment",
};

const POST_TYPE_LABELS: Record<string, string> = {
  general: "UPDATE",
  gym_selfie: "GYM SELFIE",
  evolution_reveal: "EVOLUTION REVEAL",
  streak_milestone: "STREAK MILESTONE",
  transformation: "TRANSFORMATION",
  workout_stat: "WORKOUT STAT",
  hatch_moment: "HATCH MOMENT",
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

// SVG content lives inside <text> nodes so we only need to escape XML-significant chars.
function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
  // Soft-delete marker. When set, the post should be treated as hidden — the
  // OG preview collapses to the neutral default so link unfurls in
  // WhatsApp/Slack/Discord can't leak content the author already removed.
  deletedAt?: Date | string | null;
}

export interface OgAuthorInput {
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  // Platform-level account states. When true, the author is not allowed to
  // appear in public surfaces; the OG preview must collapse to the neutral
  // default so suspended/blocked accounts can't keep getting impressions via
  // already-pasted share links.
  isSuspended?: boolean | null;
  // Already-resolved (id + tier) accent palette id, used purely for ETag
  // construction so changing the player's accent in settings busts the
  // crawler cache. The actual gradient is on `accent`.
  accentId?: string | null;
  accent?: { from: string; to: string } | null;
}

/** True when the post or its author is in a state that must not be publicly previewed. */
export function isOgHidden(post: OgPostInput | null, author: OgAuthorInput | null): boolean {
  if (!post) return false;
  if (post.isFlagged) return true;
  if (post.deletedAt != null) return true;
  if (author?.isSuspended) return true;
  return false;
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
 * Flagged, soft-deleted, suspended-author, or missing posts collapse to the
 * neutral default preview so we never leak moderated, removed, or otherwise
 * non-public content into WhatsApp / Slack / Discord unfurls.
 */
export function renderOgHtml({ baseUrl, id, post, author }: RenderOgArgs): string {
  const fallbackImage = `${baseUrl}/opengraph.jpg`;
  // Real browsers are bounced to the SPA's `/p/:id` route so users actually
  // land on the post they clicked. The api-server owns the `/post` path
  // prefix, so the SPA's own `/post/:id` route is unreachable from external
  // cold links — `/p/:id` is the parallel SPA-served route.
  const appUrl = id != null && Number.isFinite(id) && id > 0
    ? `${baseUrl}/p/${id}`
    : `${baseUrl}/`;
  const canonicalUrl = `${baseUrl}/post/${id != null && Number.isFinite(id) ? id : ""}`;

  let title = "HatchUp";
  let description = "HatchUp Fitness Pals — the fitness RPG where every step hatches a creature.";
  let imageUrl = fallbackImage;

  if (post && !isOgHidden(post, author)) {
    const authorName = author?.displayName || author?.username || "A HatchUp player";
    const tag = POST_TYPE_TAGS[post.postType] ?? POST_TYPE_TAGS.general;
    title = `${tag} — ${authorName} on HatchUp`;
    description = truncate(`${tag} · ${post.content}`, 280);
    if (post.mediaUrl) {
      imageUrl = isAbsoluteUrl(post.mediaUrl)
        ? post.mediaUrl
        : `${baseUrl}${post.mediaUrl.startsWith("/") ? "" : "/"}${post.mediaUrl}`;
    } else if (id != null && Number.isFinite(id)) {
      // No attached media — point crawlers at the on-the-fly branded share card.
      imageUrl = `${baseUrl}/post/${id}/og.png`;
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
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
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

// ── Branded share-card SVG ───────────────────────────────────────────────────
// Pure SVG builder so it can be unit tested without a rasterizer. The route
// handler is responsible for handing the resulting SVG to resvg-js and
// resolving the avatar <image href="..."> if one was emitted.

export interface AccentGradientInput {
  from: string;
  to: string;
}

const DEFAULT_ACCENT_FROM = "#ff3d8b";
const DEFAULT_ACCENT_TO = "#ff6b3d";

function resolveAccent(accent: AccentGradientInput | null | undefined): AccentGradientInput {
  if (!accent) return { from: DEFAULT_ACCENT_FROM, to: DEFAULT_ACCENT_TO };
  return {
    from: typeof accent.from === "string" && accent.from ? accent.from : DEFAULT_ACCENT_FROM,
    to: typeof accent.to === "string" && accent.to ? accent.to : DEFAULT_ACCENT_TO,
  };
}

export interface BuildOgSvgArgs {
  authorName: string;
  authorHandle: string;
  postTypeLabel: string;
  content: string;
  avatarHref: string | null;
  /** Optional accent gradient — defaults to the HatchUp pink→orange brand stripe. */
  accent?: AccentGradientInput | null;
}

// Naive word-wrap for SVG <text> rendering. resvg does not lay out text, so we
// have to break lines manually. The width estimate uses an average Inter glyph
// advance of ~0.55 * fontSize, which is close enough for our 1200px canvas.
function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const charsPerLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.55)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= charsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (word.length > charsPerLine) {
        let remaining = word;
        while (remaining.length > charsPerLine) {
          lines.push(remaining.slice(0, charsPerLine));
          remaining = remaining.slice(charsPerLine);
        }
        current = remaining;
      } else {
        current = word;
      }
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1] ?? "";
    if (last.length > 4) {
      lines[maxLines - 1] = last.slice(0, last.length - 1).trimEnd() + "…";
    }
  }
  return lines;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function buildOgSvg(opts: BuildOgSvgArgs): string {
  const width = 1200;
  const height = 630;
  const padding = 80;
  const innerWidth = width - padding * 2;
  const accent = resolveAccent(opts.accent);

  const contentLines = wrapText(opts.content, innerWidth, 56, 5);
  const initials = initialsFor(opts.authorName);

  const lineY = (i: number) => 310 + i * 74;
  const contentTspans = contentLines
    .map((line, i) => `<tspan x="${padding}" y="${lineY(i)}">${escapeXml(line)}</tspan>`)
    .join("");

  const avatarCx = padding + 40;
  const avatarCy = height - padding - 24;
  const avatarR = 40;
  const avatarBlock = opts.avatarHref
    ? `<defs>
    <clipPath id="avatarClip"><circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}"/></clipPath>
  </defs>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 3}" fill="url(#accent)"/>
  <image href="${escapeXml(opts.avatarHref)}" x="${avatarCx - avatarR}" y="${avatarCy - avatarR}" width="${avatarR * 2}" height="${avatarR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>`
    : `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="url(#accent)"/>
  <text x="${avatarCx}" y="${avatarCy + 10}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="32" fill="#ffffff">${escapeXml(initials)}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a0f"/>
      <stop offset="100%" stop-color="#1a0a1a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${escapeAttr(accent.from)}"/>
      <stop offset="100%" stop-color="${escapeAttr(accent.to)}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${width}" height="10" fill="url(#accent)"/>
  <rect x="0" y="${height - 10}" width="${width}" height="10" fill="url(#accent)"/>

  <!-- Brand mark -->
  <text x="${padding}" y="${padding + 20}" font-family="Inter, sans-serif" font-weight="700" font-size="42" fill="#ffffff" letter-spacing="2">HATCHUP</text>
  <text x="${padding}" y="${padding + 56}" font-family="Inter, sans-serif" font-weight="400" font-size="20" fill="#a1a1aa">Fitness Pals · Every step hatches a creature</text>

  <!-- Post type tag pill -->
  <rect x="${padding}" y="200" rx="28" ry="28" width="${Math.min(innerWidth, 80 + opts.postTypeLabel.length * 16)}" height="56" fill="url(#accent)" opacity="0.9"/>
  <text x="${padding + 32}" y="237" font-family="Inter, sans-serif" font-weight="700" font-size="24" fill="#ffffff" letter-spacing="3">${escapeXml(opts.postTypeLabel)}</text>

  <!-- Post content -->
  <text font-family="Inter, sans-serif" font-weight="700" font-size="56" fill="#f5f5f7">
    ${contentTspans}
  </text>

  <!-- Author block (bottom) -->
  ${avatarBlock}
  <text x="${padding + 100}" y="${height - padding - 32}" font-family="Inter, sans-serif" font-weight="700" font-size="28" fill="#ffffff">${escapeXml(opts.authorName)}</text>
  <text x="${padding + 100}" y="${height - padding - 4}" font-family="Inter, sans-serif" font-weight="400" font-size="22" fill="#a1a1aa">@${escapeXml(opts.authorHandle)}</text>
</svg>`;
}

export function postTypeLabel(postType: string): string {
  return POST_TYPE_LABELS[postType] ?? POST_TYPE_LABELS.general!;
}

export function ogTruncate(text: string, max: number): string {
  return truncate(text, max);
}

// ── Crawler detection ────────────────────────────────────────────────────────
// Link-unfurl crawlers (WhatsApp, Slack, Discord, Twitter/X, Facebook, etc.)
// fetch the URL once with their own User-Agent and parse the <meta> tags.
// Real browsers should be sent straight to the SPA so users don't see a
// flash of OG HTML before the redirect happens.
//
// Substring match against a lowercased UA. Patterns lifted from the well-known
// public list of OG/unfurl crawlers — kept conservative on purpose: when in
// doubt we'd rather treat the request as a browser and 302 it.
const CRAWLER_UA_PATTERNS: readonly string[] = [
  "facebookexternalhit",
  "facebookcatalog",
  "facebookbot",
  "twitterbot",
  "x-bot",
  "slackbot",
  "slack-imgproxy",
  "discordbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "pinterest",
  "redditbot",
  "embedly",
  "skypeuripreview",
  "applebot",
  "vkshare",
  "viber",
  "line-poker",
  "google-inspectiontool",
  "bingpreview",
  "duckduckbot",
  "googlebot",
  "bingbot",
  "yahoo! slurp",
  "yandexbot",
  "baiduspider",
  "ia_archiver",
  "qwantify",
  "msnbot",
  "iframely",
  "snapchat",
  "tumblr",
];

/**
 * True when the given User-Agent string belongs to a known link-unfurl or
 * search-engine crawler that needs the OG HTML response. Real browsers
 * (Chrome / Safari / Firefox / Edge) return false and should be 302'd to the
 * SPA route instead.
 */
export function isOgCrawlerUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  for (const needle of CRAWLER_UA_PATTERNS) {
    if (lower.includes(needle)) return true;
  }
  return false;
}

// ── Player / Club share cards ────────────────────────────────────────────────
// Reuse the same SVG-to-PNG pipeline as post share cards so every HatchUp link
// (post, player profile, or club page) unfurls with the same on-brand visual.

export interface OgHatchlingInput {
  name: string;
  rarity: string;
  spriteUrl: string | null;
}

export interface OgPlayerInput {
  id: number;
  displayName?: string | null;
  username: string;
  avatarUrl?: string | null;
  level: number;
  rank?: string | null;
  title?: string | null;
  totalSteps?: number | null;
  currentStreak?: number | null;
  isVerified?: boolean | null;
  accentId?: string | null;
  accent?: { from: string; to: string } | null;
  activeHatchling?: OgHatchlingInput | null;
}

export interface OgClubInput {
  id: number;
  name: string;
  description?: string | null;
  emblem?: string | null;
  memberCount: number;
  maxMembers?: number | null;
  level: number;
  totalWins?: number | null;
  accentId?: string | null;
  accent?: { from: string; to: string } | null;
}

export interface RenderPlayerOgHtmlArgs {
  baseUrl: string;
  username: string;
  player: OgPlayerInput | null;
}

export interface RenderClubOgHtmlArgs {
  baseUrl: string;
  id: number | null;
  club: OgClubInput | null;
}

function formatNumberCompact(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 1000) return String(Math.round(value));
  if (value < 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function renderPlayerOgHtml({ baseUrl, username, player }: RenderPlayerOgHtmlArgs): string {
  const fallbackImage = `${baseUrl}/opengraph.jpg`;
  const safeUsername = encodeURIComponent(username);
  // SPA owns `/players/:id` (by id). The api-server owns `/player/:username`
  // for unfurls. Real browsers are bounced over to the SPA route using the
  // resolved player id.
  const appUrl = player
    ? `${baseUrl}/players/${player.id}`
    : `${baseUrl}/`;
  const canonicalUrl = `${baseUrl}/player/${safeUsername}`;

  let title = "HatchUp";
  let description = "HatchUp Fitness Pals — the fitness RPG where every step hatches a creature.";
  let imageUrl = fallbackImage;

  if (player) {
    const displayName = player.displayName || player.username;
    title = `${displayName} — Level ${player.level} on HatchUp`;
    const descParts: string[] = [`Level ${player.level}`];
    if (player.rank) descParts.push(player.rank);
    if (typeof player.currentStreak === "number" && player.currentStreak > 0) {
      descParts.push(`🔥 ${player.currentStreak}-day streak`);
    }
    if (typeof player.totalSteps === "number" && player.totalSteps > 0) {
      descParts.push(`${formatNumberCompact(player.totalSteps)} steps`);
    }
    description = truncate(descParts.join(" · "), 280);
    imageUrl = `${baseUrl}/player/${safeUsername}/og.png`;
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
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="${safeCanonical}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
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

export function renderClubOgHtml({ baseUrl, id, club }: RenderClubOgHtmlArgs): string {
  const fallbackImage = `${baseUrl}/opengraph.jpg`;
  const appUrl = id != null && Number.isFinite(id) && id > 0
    ? `${baseUrl}/clubs/${id}`
    : `${baseUrl}/`;
  const canonicalUrl = `${baseUrl}/club/${id != null && Number.isFinite(id) ? id : ""}`;

  let title = "HatchUp";
  let description = "HatchUp Fitness Pals — the fitness RPG where every step hatches a creature.";
  let imageUrl = fallbackImage;

  if (club) {
    title = `${club.name} — HatchUp Club`;
    const descParts: string[] = [`Level ${club.level}`, `${club.memberCount} members`];
    if (typeof club.totalWins === "number" && club.totalWins > 0) {
      descParts.push(`${club.totalWins} wins`);
    }
    if (club.description) descParts.push(club.description);
    description = truncate(descParts.join(" · "), 280);
    if (id != null && Number.isFinite(id) && id > 0) {
      imageUrl = `${baseUrl}/club/${id}/og.png`;
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
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
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

// ── Branded share-card SVG (player / club) ───────────────────────────────────

// Renders the upper-right creature panel for a player share card.
// Panel region: x=832–1120, y=168–416 (288×248 px).
// When the player has no active Hatchling this function is never called and
// the region stays empty, keeping the card layout identical to before.
function buildHatchlingPanelSvg(h: OgHatchlingInput): string {
  const panelX = 832;
  const panelY = 168;
  const panelW = 288;
  const panelH = 248;
  const cx = panelX + panelW / 2; // 976
  const spriteR = 56;
  const spriteCy = panelY + 48 + spriteR; // 272

  const trimmedName = h.name.length > 14
    ? h.name.slice(0, 13).trimEnd() + "…"
    : h.name;
  const rarityLabel = h.rarity.toUpperCase().slice(0, 10);
  const rarityPillW = Math.min(panelW - 40, 40 + rarityLabel.length * 14);
  const rarityPillX = cx - rarityPillW / 2;

  const spriteBlock = h.spriteUrl && /^https?:\/\//i.test(h.spriteUrl)
    ? `<defs>
    <clipPath id="hatchlingClip"><circle cx="${cx}" cy="${spriteCy}" r="${spriteR}"/></clipPath>
  </defs>
  <circle cx="${cx}" cy="${spriteCy}" r="${spriteR + 4}" fill="#ffffff" fill-opacity="0.08"/>
  <image href="${escapeXml(h.spriteUrl)}" x="${cx - spriteR}" y="${spriteCy - spriteR}" width="${spriteR * 2}" height="${spriteR * 2}" preserveAspectRatio="xMidYMid meet" clip-path="url(#hatchlingClip)"/>`
    : `<circle cx="${cx}" cy="${spriteCy}" r="${spriteR}" fill="#ffffff" fill-opacity="0.08"/>
  <text x="${cx}" y="${spriteCy + 20}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="52" fill="#ffffff" opacity="0.4">?</text>`;

  return `<!-- Active Hatchling panel -->
  <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="16" ry="16" fill="#ffffff" fill-opacity="0.05" stroke="url(#accent)" stroke-width="1.5"/>
  <text x="${cx}" y="${panelY + 24}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="400" font-size="13" fill="#a1a1aa" letter-spacing="3">HATCHLING</text>
  ${spriteBlock}
  <text x="${cx}" y="${panelY + panelH - 64}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="22" fill="#f5f5f7">${escapeXml(trimmedName)}</text>
  <rect x="${rarityPillX}" y="${panelY + panelH - 52}" width="${rarityPillW}" height="30" rx="15" fill="url(#accent)" fill-opacity="0.85"/>
  <text x="${cx}" y="${panelY + panelH - 31}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="13" fill="#ffffff" letter-spacing="2">${escapeXml(rarityLabel)}</text>`;
}

export interface BuildPlayerOgSvgArgs {
  displayName: string;
  username: string;
  level: number;
  rank: string | null;
  title: string | null;
  totalSteps: number | null;
  currentStreak: number | null;
  isVerified: boolean;
  avatarHref: string | null;
  accent?: AccentGradientInput | null;
  activeHatchling?: OgHatchlingInput | null;
}

export function buildPlayerOgSvg(opts: BuildPlayerOgSvgArgs): string {
  const width = 1200;
  const height = 630;
  const padding = 80;
  const accent = resolveAccent(opts.accent);
  const initials = initialsFor(opts.displayName || opts.username);

  const avatarCx = padding + 110;
  const avatarCy = 340;
  const avatarR = 110;
  const avatarBlock = opts.avatarHref
    ? `<defs>
    <clipPath id="avatarClip"><circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}"/></clipPath>
  </defs>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 6}" fill="url(#accent)"/>
  <image href="${escapeXml(opts.avatarHref)}" x="${avatarCx - avatarR}" y="${avatarCy - avatarR}" width="${avatarR * 2}" height="${avatarR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>`
    : `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="url(#accent)"/>
  <text x="${avatarCx}" y="${avatarCy + 26}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="80" fill="#ffffff">${escapeXml(initials)}</text>`;

  const verifiedBadge = opts.isVerified
    ? `<circle cx="${avatarCx + avatarR - 18}" cy="${avatarCy + avatarR - 18}" r="26" fill="#3da6ff" stroke="#0a0a0f" stroke-width="6"/>
  <text x="${avatarCx + avatarR - 18}" y="${avatarCy + avatarR - 10}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="26" fill="#ffffff">&#x2713;</text>`
    : "";

  const infoX = avatarCx + avatarR + 60;
  const displayName = opts.displayName || opts.username;
  // When a hatchling panel occupies the upper-right (x≥832), cap the name
  // at 13 chars so it stays in the x=360–760 zone and avoids overlap.
  const maxNameChars = opts.activeHatchling ? 13 : 22;
  const trimmedName = displayName.length > maxNameChars
    ? displayName.slice(0, maxNameChars - 1).trimEnd() + "…"
    : displayName;
  const trimmedUser = opts.username.length > 22 ? opts.username.slice(0, 21).trimEnd() + "…" : opts.username;

  const statPills: Array<{ label: string; value: string }> = [
    { label: "LEVEL", value: String(opts.level) },
  ];
  if (opts.rank) statPills.push({ label: "RANK", value: opts.rank });
  if (typeof opts.currentStreak === "number" && opts.currentStreak > 0) {
    statPills.push({ label: "STREAK", value: `${opts.currentStreak}d` });
  }
  if (typeof opts.totalSteps === "number" && opts.totalSteps > 0) {
    statPills.push({ label: "STEPS", value: formatNumberCompact(opts.totalSteps) });
  }

  const pillY = height - padding - 110;
  const pillHeight = 110;
  const pillGap = 24;
  const pillCount = Math.min(statPills.length, 4);
  const pillWidth = (width - padding * 2 - pillGap * (pillCount - 1)) / pillCount;
  const pillBlocks = statPills.slice(0, 4).map((pill, i) => {
    const x = padding + i * (pillWidth + pillGap);
    return `<rect x="${x}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="20" ry="20" fill="#ffffff" fill-opacity="0.06" stroke="url(#accent)" stroke-width="2"/>
  <text x="${x + pillWidth / 2}" y="${pillY + 42}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="400" font-size="20" fill="#a1a1aa" letter-spacing="3">${escapeXml(pill.label)}</text>
  <text x="${x + pillWidth / 2}" y="${pillY + 86}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="40" fill="#ffffff">${escapeXml(pill.value)}</text>`;
  }).join("\n  ");

  const titleLine = opts.title
    ? `<text x="${infoX}" y="392" font-family="Inter, sans-serif" font-weight="400" font-size="24" fill="#ff3d8b">${escapeXml(opts.title)}</text>`
    : "";

  // ── Active Hatchling panel (upper-right) ─────────────────────────────────
  // Rendered when the player has an active Hatchling. Occupies x=832–1120,
  // y=168–416 so it never overlaps the avatar or stat pills.
  const hatchlingBlock = opts.activeHatchling
    ? buildHatchlingPanelSvg(opts.activeHatchling)
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a0f"/>
      <stop offset="100%" stop-color="#1a0a1a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${escapeAttr(accent.from)}"/>
      <stop offset="100%" stop-color="${escapeAttr(accent.to)}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${width}" height="10" fill="url(#accent)"/>
  <rect x="0" y="${height - 10}" width="${width}" height="10" fill="url(#accent)"/>

  <!-- Brand mark -->
  <text x="${padding}" y="${padding + 20}" font-family="Inter, sans-serif" font-weight="700" font-size="42" fill="#ffffff" letter-spacing="2">HATCHUP</text>
  <text x="${padding}" y="${padding + 56}" font-family="Inter, sans-serif" font-weight="400" font-size="20" fill="#a1a1aa">Fitness Pals · Every step hatches a creature</text>

  <!-- Player type tag pill -->
  <rect x="${padding}" y="180" rx="26" ry="26" width="180" height="52" fill="url(#accent)" opacity="0.9"/>
  <text x="${padding + 30}" y="215" font-family="Inter, sans-serif" font-weight="700" font-size="22" fill="#ffffff" letter-spacing="3">PLAYER</text>

  <!-- Avatar + verified badge -->
  ${avatarBlock}
  ${verifiedBadge}

  <!-- Name + handle -->
  <text x="${infoX}" y="340" font-family="Inter, sans-serif" font-weight="700" font-size="56" fill="#f5f5f7">${escapeXml(trimmedName)}</text>
  <text x="${infoX}" y="362" font-family="Inter, sans-serif" font-weight="400" font-size="22" fill="#a1a1aa">@${escapeXml(trimmedUser)}</text>
  ${titleLine}

  <!-- Active Hatchling panel -->
  ${hatchlingBlock}

  <!-- Stat pills -->
  ${pillBlocks}
</svg>`;
}

export interface BuildClubOgSvgArgs {
  name: string;
  description: string | null;
  level: number;
  memberCount: number;
  maxMembers: number | null;
  totalWins: number | null;
  emblem: string | null;
  accent?: AccentGradientInput | null;
}

export function buildClubOgSvg(opts: BuildClubOgSvgArgs): string {
  const width = 1200;
  const height = 630;
  const padding = 80;
  const innerWidth = width - padding * 2;
  const accent = resolveAccent(opts.accent);

  const nameLines = wrapText(opts.name, innerWidth - 240, 64, 2);
  const descLines = opts.description ? wrapText(opts.description, innerWidth - 240, 28, 3) : [];

  const nameTspans = nameLines
    .map((line, i) => `<tspan x="${padding + 200}" y="${260 + i * 78}">${escapeXml(line)}</tspan>`)
    .join("");
  const descTspans = descLines
    .map((line, i) => `<tspan x="${padding + 200}" y="${260 + nameLines.length * 78 + 24 + i * 38}">${escapeXml(line)}</tspan>`)
    .join("");

  const emblemCx = padding + 90;
  const emblemCy = 280;
  const emblemR = 80;
  const emblemBlock = opts.emblem && /^https?:\/\//i.test(opts.emblem)
    ? `<defs>
    <clipPath id="emblemClip"><circle cx="${emblemCx}" cy="${emblemCy}" r="${emblemR}"/></clipPath>
  </defs>
  <circle cx="${emblemCx}" cy="${emblemCy}" r="${emblemR + 5}" fill="url(#accent)"/>
  <image href="${escapeXml(opts.emblem)}" x="${emblemCx - emblemR}" y="${emblemCy - emblemR}" width="${emblemR * 2}" height="${emblemR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#emblemClip)"/>`
    : `<circle cx="${emblemCx}" cy="${emblemCy}" r="${emblemR}" fill="url(#accent)"/>
  <text x="${emblemCx}" y="${emblemCy + 22}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="64" fill="#ffffff">${escapeXml(opts.emblem && !/^https?:\/\//i.test(opts.emblem) ? opts.emblem.slice(0, 2) : initialsFor(opts.name))}</text>`;

  const memberLabel = opts.maxMembers && opts.maxMembers > 0
    ? `${opts.memberCount} / ${opts.maxMembers}`
    : String(opts.memberCount);

  const statPills: Array<{ label: string; value: string }> = [
    { label: "LEVEL", value: String(opts.level) },
    { label: "MEMBERS", value: memberLabel },
  ];
  if (typeof opts.totalWins === "number" && opts.totalWins > 0) {
    statPills.push({ label: "WINS", value: formatNumberCompact(opts.totalWins) });
  }

  const pillY = height - padding - 110;
  const pillHeight = 110;
  const pillGap = 24;
  const pillCount = statPills.length;
  const pillWidth = (width - padding * 2 - pillGap * (pillCount - 1)) / pillCount;
  const pillBlocks = statPills.map((pill, i) => {
    const x = padding + i * (pillWidth + pillGap);
    return `<rect x="${x}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="20" ry="20" fill="#ffffff" fill-opacity="0.06" stroke="url(#accent)" stroke-width="2"/>
  <text x="${x + pillWidth / 2}" y="${pillY + 42}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="400" font-size="20" fill="#a1a1aa" letter-spacing="3">${escapeXml(pill.label)}</text>
  <text x="${x + pillWidth / 2}" y="${pillY + 86}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="40" fill="#ffffff">${escapeXml(pill.value)}</text>`;
  }).join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a0f"/>
      <stop offset="100%" stop-color="#1a0a1a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${escapeAttr(accent.from)}"/>
      <stop offset="100%" stop-color="${escapeAttr(accent.to)}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${width}" height="10" fill="url(#accent)"/>
  <rect x="0" y="${height - 10}" width="${width}" height="10" fill="url(#accent)"/>

  <!-- Brand mark -->
  <text x="${padding}" y="${padding + 20}" font-family="Inter, sans-serif" font-weight="700" font-size="42" fill="#ffffff" letter-spacing="2">HATCHUP</text>
  <text x="${padding}" y="${padding + 56}" font-family="Inter, sans-serif" font-weight="400" font-size="20" fill="#a1a1aa">Fitness Pals · Every step hatches a creature</text>

  <!-- Club type tag pill -->
  <rect x="${padding}" y="180" rx="26" ry="26" width="150" height="52" fill="url(#accent)" opacity="0.9"/>
  <text x="${padding + 30}" y="215" font-family="Inter, sans-serif" font-weight="700" font-size="22" fill="#ffffff" letter-spacing="3">CLUB</text>

  <!-- Emblem -->
  ${emblemBlock}

  <!-- Name + description -->
  <text font-family="Inter, sans-serif" font-weight="700" font-size="64" fill="#f5f5f7">${nameTspans}</text>
  <text font-family="Inter, sans-serif" font-weight="400" font-size="28" fill="#a1a1aa">${descTspans}</text>

  <!-- Stat pills -->
  ${pillBlocks}
</svg>`;
}

// ── Hatch share-card SVG ─────────────────────────────────────────────────────
// Generates a 1200x630 branded share card for a legendary hatch moment.
// Rarity drives the gradient palette; the realm emoji is rendered as a
// large Unicode glyph in the centre so no external image is needed.

const HATCH_RARITY_GRADIENT: Record<string, [string, string]> = {
  Legendary: ["#3b1f00", "#6b3a00"],
  Mythic:    ["#3b0011", "#6b0022"],
  Ancient:   ["#003b35", "#006b5f"],
  Celestial: ["#0a0038", "#1a0060"],
  Epic:      ["#1a003b", "#2d0060"],
  Rare:      ["#001a3b", "#002b6b"],
  Common:    ["#0a0a0f", "#1a0a1a"],
};

const HATCH_RARITY_ACCENT: Record<string, [string, string]> = {
  Legendary: ["#facc15", "#f59e0b"],
  Mythic:    ["#f87171", "#ef4444"],
  Ancient:   ["#2dd4bf", "#14b8a6"],
  Celestial: ["#a5b4fc", "#818cf8"],
  Epic:      ["#c084fc", "#a855f7"],
  Rare:      ["#60a5fa", "#3b82f6"],
  Common:    ["#a1a1aa", "#71717a"],
};

export interface BuildHatchShareSvgArgs {
  name: string;
  species: string;
  rarity: string;
  realmEmoji: string;
  steps: number;
  level?: number;
}

export function buildHatchShareSvg(opts: BuildHatchShareSvgArgs): string {
  const width = 1200;
  const height = 630;
  const padding = 80;

  const [bg1, bg2] = HATCH_RARITY_GRADIENT[opts.rarity] ?? HATCH_RARITY_GRADIENT.Common!;
  const [acc1, acc2] = HATCH_RARITY_ACCENT[opts.rarity] ?? HATCH_RARITY_ACCENT.Common!;

  const rarityLabel = `✦ ${opts.rarity.toUpperCase()} ✦`;
  const stepsLabel = Number(opts.steps).toLocaleString("en-US") + " steps";
  const levelLabel = opts.level != null ? `Lv.${opts.level}` : null;

  const nameLines = wrapText(opts.name, 900, 80, 2);
  const nameTspans = nameLines
    .map((line, i) => `<tspan x="${width / 2}" y="${350 + i * 96}">${escapeXml(line)}</tspan>`)
    .join("");

  const footerParts = [stepsLabel];
  if (levelLabel) footerParts.push(levelLabel);
  footerParts.push("HatchUp");
  const footerText = footerParts.join(" · ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${escapeAttr(bg1)}"/>
      <stop offset="100%" stop-color="${escapeAttr(bg2)}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${escapeAttr(acc1)}"/>
      <stop offset="100%" stop-color="${escapeAttr(acc2)}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="40%">
      <stop offset="0%" stop-color="${escapeAttr(acc1)}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${escapeAttr(bg1)}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>

  <!-- Accent stripes -->
  <rect x="0" y="0" width="${width}" height="10" fill="url(#accent)"/>
  <rect x="0" y="${height - 10}" width="${width}" height="10" fill="url(#accent)"/>

  <!-- Brand mark (top-left) -->
  <text x="${padding}" y="${padding + 20}" font-family="Inter, sans-serif" font-weight="700" font-size="38" fill="#ffffff" letter-spacing="2" opacity="0.9">HATCHUP</text>
  <text x="${padding}" y="${padding + 54}" font-family="Inter, sans-serif" font-weight="400" font-size="18" fill="#a1a1aa">Every step hatches a creature</text>

  <!-- Rarity pill (top-right) -->
  <rect x="${width - padding - 240}" y="${padding - 4}" rx="24" ry="24" width="240" height="52" fill="url(#accent)" opacity="0.9"/>
  <text x="${width - padding - 120}" y="${padding + 29}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="20" fill="#000000" letter-spacing="3">${escapeXml(rarityLabel)}</text>

  <!-- Realm emoji (large, centred) -->
  <text x="${width / 2}" y="240" text-anchor="middle" font-family="serif" font-size="140" dominant-baseline="central">${escapeXml(opts.realmEmoji)}</text>

  <!-- Creature name -->
  <text text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="80" fill="#ffffff">
    ${nameTspans}
  </text>

  <!-- Species -->
  <text x="${width / 2}" y="${350 + nameLines.length * 96}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="400" font-size="32" fill="${escapeAttr(acc1)}">${escapeXml(opts.species)}</text>

  <!-- Divider -->
  <line x1="${padding + 80}" y1="${height - padding - 56}" x2="${width - padding - 80}" y2="${height - padding - 56}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>

  <!-- Footer: steps + branding -->
  <text x="${width / 2}" y="${height - padding - 22}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="400" font-size="22" fill="#a1a1aa">${escapeXml(footerText)}</text>
</svg>`;
}
