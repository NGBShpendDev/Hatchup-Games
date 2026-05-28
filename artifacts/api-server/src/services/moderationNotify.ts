import { db } from "@workspace/db";
import { notificationsTable, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.ts";
import { isEmailConfigured, sendTransactionalEmail } from "./emailService.ts";
import { pushForNotification } from "./notificationFanout.ts";

export type ModerationAction = "suspend" | "unsuspend" | "verify";

// The suspended screen is rendered as a full-screen overlay any time
// `player.isSuspended` is true, so linking to `/` is the most reliable
// way to land a suspended user on the appeal UI (no dedicated route
// exists, and any in-app route gets covered by the overlay). For
// unsuspend we send them home so they immediately see access restored.
// For verify we keep them on the safety/guidelines page since there is
// no account-status screen to surface.
const SUSPENDED_LINK = "/";
const RESTORED_LINK = "/";
const SAFETY_LINK = "/safety/guidelines";

interface Copy {
  type: string;
  title: string;
  body: (reason: string | null) => string;
  emailSubject: string;
  emailIntro: string;
  link: string;
  emailCtaLabel: string;
}

const COPY: Record<ModerationAction, Copy> = {
  suspend: {
    type: "account_suspended",
    title: "Your HATCHUP account has been suspended",
    body: (reason) =>
      reason
        ? `A moderator suspended your account. Reason: ${reason}. Tap to view details and file an appeal.`
        : "A moderator suspended your account. Tap to view details and file an appeal.",
    emailSubject: "Your HATCHUP account has been suspended",
    emailIntro: "A HATCHUP moderator has suspended your account.",
    link: SUSPENDED_LINK,
    emailCtaLabel: "Review your account & file an appeal",
  },
  unsuspend: {
    type: "account_restored",
    title: "Your HATCHUP account has been restored",
    body: (reason) =>
      reason
        ? `Welcome back! Your account has been reinstated. Note from moderation: ${reason}`
        : "Welcome back! Your account has been reinstated and you can sign in again.",
    emailSubject: "Your HATCHUP account has been restored",
    emailIntro: "Good news — a HATCHUP moderator has reinstated your account.",
    link: RESTORED_LINK,
    emailCtaLabel: "Open HATCHUP",
  },
  verify: {
    type: "account_verified",
    title: "Your HATCHUP profile is now verified",
    body: (reason) =>
      reason
        ? `A moderator approved your verification request. Note: ${reason}`
        : "A moderator approved your verification request. The blue checkmark now shows on your profile.",
    emailSubject: "Your HATCHUP profile is verified",
    emailIntro: "A HATCHUP moderator has approved your profile verification.",
    link: SAFETY_LINK,
    emailCtaLabel: "Review the community guidelines",
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Notify a player when an admin moderation action affects their account.
 * Always best-effort: failures are logged but never thrown so they cannot
 * break the moderation request that triggered them.
 *
 * Always inserts an in-app notification. Additionally sends an email when:
 *   - an email provider is configured (`isEmailConfigured()`), AND
 *   - the player has an `email` on file, AND
 *   - the player has opted in via `notifyModerationEmail` (the dedicated
 *     account-status email opt-in, default true). This is intentionally
 *     separate from `notifyRecapEmail` so silencing weekly recaps doesn't
 *     also silence suspend/unsuspend/verify notices.
 */
export async function notifyModerationAction(
  playerId: number,
  action: ModerationAction,
  reason: string | null,
): Promise<void> {
  const copy = COPY[action];
  const cleanReason = reason && reason.trim() ? reason.trim().slice(0, 500) : null;

  try {
    await db.insert(notificationsTable).values({
      playerId,
      type: copy.type,
      title: copy.title,
      body: copy.body(cleanReason),
      link: copy.link,
    });
    // Fan out to web push so players hear about account-status changes even
    // when the app is closed. Best-effort: respects the per-category push
    // opt-out inside `sendPushToPlayer` and never throws back to the caller.
    void pushForNotification(
      {
        playerId,
        type: copy.type,
        title: copy.title,
        body: copy.body(cleanReason),
        link: SAFETY_LINK,
      },
      { tag: `moderation-${action}-${playerId}` },
    );
  } catch (err) {
    logger.warn({ err, playerId, action }, "moderation notification insert failed");
  }

  if (!isEmailConfigured()) return;

  try {
    const player = await db.query.playersTable.findFirst({
      where: eq(playersTable.id, playerId),
      columns: {
        email: true,
        notifyModerationEmail: true,
        displayName: true,
        username: true,
      },
    });
    if (!player || !player.email) return;
    if (!player.notifyModerationEmail) return;

    const name = player.displayName ?? player.username;
    const safeName = escapeHtml(name);
    const safeReason = cleanReason ? escapeHtml(cleanReason) : null;
    const reasonBlock = safeReason
      ? `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;"><strong>Reason from moderation:</strong> ${safeReason}</p>`
      : "";

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
        <h1 style="font-size:22px;margin:0 0 16px;">${escapeHtml(copy.title)}</h1>
        <p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Hi ${safeName},</p>
        <p style="font-size:16px;line-height:1.5;margin:0 0 12px;">${escapeHtml(copy.emailIntro)}</p>
        ${reasonBlock}
        <p style="margin:24px 0;"><a href="${copy.link}" style="background:#ec4899;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(copy.emailCtaLabel)}</a></p>
        <p style="font-size:12px;color:#666;">You're receiving this because you have HATCHUP account emails enabled. You can change this in Settings → Privacy.</p>
      </div>
    `;

    const textParts = [
      copy.emailIntro,
      cleanReason ? `Reason from moderation: ${cleanReason}` : null,
      `${copy.emailCtaLabel}: ${copy.link}`,
    ].filter(Boolean);

    await sendTransactionalEmail({
      to: player.email,
      subject: copy.emailSubject,
      html,
      text: textParts.join("\n\n"),
    });
  } catch (err) {
    logger.warn({ err, playerId, action }, "moderation notification email step failed");
  }
}
