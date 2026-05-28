// Best-effort email channel for social notifications (reactions, replies,
// mentions, follows). Mirrors the inbox row when the recipient has opted in
// via the per-channel toggle on `/settings/privacy` AND has a confirmed
// email on file. Skips silently otherwise so callers can fan-out without
// caring whether email is configured.

import { db, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isEmailConfigured, sendTransactionalEmail } from "./emailService.ts";
import { logger } from "../lib/logger.ts";

export interface SocialEmailPayload {
  title: string;
  body: string;
  link: string;
}

function appBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
  if (domains.length > 0) return `https://${domains[0]}`;
  return "https://hatchup.app";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send the email mirror of a social notification. Silently no-ops when the
 * recipient has no verified email, when the email provider isn't configured,
 * or when transport fails.
 */
export async function sendSocialEmail(
  playerId: number,
  payload: SocialEmailPayload,
): Promise<void> {
  if (!isEmailConfigured()) return;

  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
    columns: { email: true, emailVerifiedAt: true, displayName: true, username: true },
  });
  if (!player?.email || !player.emailVerifiedAt) return;

  const url = `${appBaseUrl()}${payload.link.startsWith("/") ? payload.link : `/${payload.link}`}`;
  const safeTitle = escapeHtml(payload.title);
  const safeBody = escapeHtml(payload.body);
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#111;">${safeTitle}</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#444;line-height:1.5;">${safeBody}</p>
      <p style="margin:0 0 20px;">
        <a href="${url}" style="display:inline-block;background:#ec4899;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">
          Open in HatchUp
        </a>
      </p>
      <p style="margin:24px 0 0;font-size:11px;color:#888;">
        You're getting this because you opted in to email notifications for this
        activity. Manage your preferences in Privacy &amp; Safety settings.
      </p>
    </div>
  `;
  const text = `${payload.title}\n\n${payload.body}\n\nOpen: ${url}`;

  try {
    await sendTransactionalEmail({
      to: player.email,
      subject: payload.title,
      html,
      text,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, playerId }, "social_email_send_failed");
  }
}
