import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidSecret } from "@/lib/webhook-secret";

/**
 * Removes the attachment files of 1:1 messages that disappeared.
 *
 * The database deletes the messages itself (delete_seen_messages() in
 * supabase/migrations/20261112020000_disappearing_messages.sql), but Storage
 * files can only be removed through the Storage API, so it posts their paths
 * here with the header `x-push-secret: <PUSH_WEBHOOK_SECRET>`.
 */

// "<room id>/<upload id>/<file name>", as the composer uploads them.
const ATTACHMENT_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[^/]+$/i;
const MAX_PATHS = 1000;

export async function POST(request: Request) {
  if (!hasValidSecret(request.headers.get("x-push-secret"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { paths?: unknown } | null;
  const paths = Array.isArray(body?.paths)
    ? body.paths
        .filter((p): p is string => typeof p === "string" && ATTACHMENT_PATH.test(p))
        .slice(0, MAX_PATHS)
    : [];
  if (paths.length === 0) {
    return Response.json({ removed: 0 });
  }

  const { data, error } = await createAdminClient().storage.from("attachments").remove(paths);
  if (error) {
    return new Response(`Couldn't remove files: ${error.message}`, { status: 500 });
  }
  return Response.json({ removed: data.length });
}
