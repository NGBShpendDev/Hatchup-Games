import { db } from "@workspace/db";
import { notificationsTable, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.ts";
import { isEmailConfigured, sendTransactionalEmail } from "./emailService.ts";

export type ModerationAction = "suspend" | "unsuspend" | "verify";

const SAFETY_LINK = "/safety/guidelines";

interface Copy {
  type: string;
  title: string;
  body: (reason: string | null) => string;
  emailSubject: string;
  emailIntro: string;
}

const COPY: Record<ModerationAction, Copy> = {
  suspend: {
    type: "account_suspended",
    title: "Your HATCHUP account has been suspended",
    body: (reason) =>
      reason
        ? `A moderator suspended your account. Reason: ${reason}`
        : "A moderator suspended your account. Review our community guidelines for details.",
    emailSubject: "Your HATCHUP account has been suspended",
    emailIntro: "A HATCHUP moderator has suspended your account.",
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
 *   - the player has opted in via `notifyRecapEmail` (the shared transactional
 *     opt-in used for other account-level emails).
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
      link: SAFETY_LINK,
    });
  } catch (err) {
    logger.warn({ err, playerId, action }, "moderation notification insert failed");
  }

  if (!isEmailConfigured()) return;

  try {
    const player = await db.query.playersTable.findFirst({
      where: eq(playersTable.id, playerId),
      columns: {
        email: true,
        notifyRecapEmail: true,
        displayName: true,
        username: true,
      },
    });
    if (!player || !player.email) return;
    if (!player.notifyRecapEmail) return;

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
        <p style="margin:24px 0;"><a href="${SAFETY_LINK}" style="background:#ec4899;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Review the community guidelines</a></p>
        <p style="font-size:12px;color:#666;">You're receiving this because you have HATCHUP account emails enabled. You can change this in Settings → Privacy.</p>
      </div>
    `;

    const textParts = [
      copy.emailIntro,
      cleanReason ? `Reason from moderation: ${cleanReason}` : null,
      `Review the community guidelines: ${SAFETY_LINK}`,
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
