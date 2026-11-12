import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Checks the `x-push-secret` header that the database sends to /api/push and
 * /api/cleanup against PUSH_WEBHOOK_SECRET, in constant time.
 */
export function hasValidSecret(received: string | null): boolean {
  const expected = process.env.PUSH_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
