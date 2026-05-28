import { logger } from "../lib/logger.ts";

/**
 * Generic transactional email gateway. Currently speaks the Resend REST API
 * (https://resend.com/docs/api-reference/emails/send-email) because it's a
 * single HTTPS POST and needs no SDK, but the entry points (`isEmailConfigured`,
 * `sendTransactionalEmail`) are provider-agnostic so we can swap in SendGrid,
 * Postmark, SES, etc. by editing this file alone.
 *
 * Behavior when no provider is configured: every send is a silent no-op that
 * returns `false` and logs at debug. This matches the Stripe pattern in
 * `stripeClient.ts` — features that "optionally email" stay best-effort and
 * never crash the request path when email isn't wired up.
 */

export interface TransactionalEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendTransactionalEmail(msg: TransactionalEmail): Promise<boolean> {
  if (!isEmailConfigured()) {
    logger.debug({ to: msg.to, subject: msg.subject }, "email provider not configured; skipping send");
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn({ status: res.status, detail, to: msg.to }, "transactional email send failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, to: msg.to }, "transactional email send threw");
    return false;
  }
}
