import crypto from "node:crypto";
import { db, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isEmailConfigured, sendTransactionalEmail } from "./emailService";
import { logger } from "../lib/logger";

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function appOrigin(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  return domain ? `https://${domain}` : "http://localhost";
}

function renderVerificationEmailHtml(name: string, link: string): string {
  const safeName = name ? name.replace(/[<>]/g, "") : "there";
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0b0b12; color:#f5f5fa; padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#16161f;border-radius:16px;padding:32px;border:1px solid rgba(255,255,255,0.08);">
    <h1 style="font-size:20px;margin:0 0 12px;">Confirm your HatchUp email</h1>
    <p style="font-size:14px;line-height:1.5;color:#cfcfdc;">
      Hey ${safeName}, please confirm this address so we can send your weekly nutrition recap and other important updates.
    </p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#ec4899;color:#fff;text-decoration:none;border-radius:9999px;font-weight:700;">Confirm email</a>
    </p>
    <p style="font-size:12px;color:#9a9aae;line-height:1.5;">
      Or paste this link into your browser:<br/>
      <span style="word-break:break-all;color:#cfcfdc;">${link}</span>
    </p>
    <p style="font-size:11px;color:#7a7a8e;margin-top:24px;">
      This link expires in 24 hours. If you didn't ask to receive HatchUp emails, you can safely ignore this message.
    </p>
  </div>
</body></html>`;
}

/**
 * Issue a fresh verification token for the player's current email and email
 * them a confirmation link. Best-effort: returns false (and logs) if email
 * isn't configured or the send fails, but never throws.
 */
export async function issueEmailVerification(
  playerId: number,
  email: string,
  displayName: string | null,
): Promise<boolean> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

  await db
    .update(playersTable)
    .set({
      emailVerifiedAt: null,
      emailVerificationToken: token,
      emailVerificationExpiresAt: expiresAt,
    })
    .where(eq(playersTable.id, playerId));

  if (!isEmailConfigured()) {
    logger.debug({ playerId }, "email verification token issued but provider not configured");
    return false;
  }

  const link = `${appOrigin()}/api/email/verify?token=${token}`;
  const html = renderVerificationEmailHtml(displayName ?? "", link);
  return sendTransactionalEmail({
    to: email,
    subject: "Confirm your HatchUp email",
    html,
  });
}
