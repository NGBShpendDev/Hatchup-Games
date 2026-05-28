import { db, bouncedEmailsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.ts";

/**
 * Bounce-list helpers.
 *
 * The email provider (Resend) fires a webhook whenever an address hard-bounces
 * or complains. We persist those addresses here and gate every outbound
 * confirmation email on the list — repeated sends to a dead inbox burn sender
 * reputation just as badly as deliberate spam.
 *
 * All reads/writes go through this module so the normalization rule (trim +
 * lowercase) lives in exactly one place.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns true if the given address is on the bounce list. */
export async function isEmailBouncing(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = await db.query.bouncedEmailsTable.findFirst({
    where: eq(bouncedEmailsTable.email, normalized),
  });
  return !!row;
}

export interface RecordBounceInput {
  email: string;
  bounceType?: string;
  reason?: string | null;
  source?: string;
}

/**
 * Idempotent upsert. Only "hard" / "complaint" bounces are persisted —
 * transient (soft) failures are noisy and self-recover. Returns true if the
 * address was added or updated.
 */
export async function recordEmailBounce(input: RecordBounceInput): Promise<boolean> {
  const normalized = normalizeEmail(input.email);
  if (!normalized) return false;
  const bounceType = (input.bounceType ?? "hard").toLowerCase();
  // Only block on durable failures. "soft" / "transient" bounces happen for
  // mailbox-full and other recoverable conditions; ignoring them avoids
  // locking out users whose inboxes were briefly unavailable.
  if (bounceType !== "hard" && bounceType !== "complaint") {
    logger.debug({ email: normalized, bounceType }, "ignoring non-hard bounce");
    return false;
  }
  try {
    await db
      .insert(bouncedEmailsTable)
      .values({
        email: normalized,
        bounceType,
        reason: input.reason ?? null,
        source: input.source ?? "resend.webhook",
      })
      .onConflictDoUpdate({
        target: bouncedEmailsTable.email,
        set: {
          bounceType,
          reason: input.reason ?? null,
          source: input.source ?? "resend.webhook",
          bouncedAt: new Date(),
        },
      });
    return true;
  } catch (err) {
    logger.warn({ err, email: normalized }, "failed to record email bounce");
    return false;
  }
}

/**
 * Clear an address from the bounce list. Used when the user changes their
 * email to a known-good address (the new one will only be re-added if it
 * bounces too). Returns true if a row was removed.
 */
export async function clearEmailBounce(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const result = await db
    .delete(bouncedEmailsTable)
    .where(eq(bouncedEmailsTable.email, normalized))
    .returning({ id: bouncedEmailsTable.id });
  return result.length > 0;
}
