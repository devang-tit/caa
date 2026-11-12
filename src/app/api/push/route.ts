import webpush from "web-push";
import { plainText } from "@/lib/rich-text";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidSecret } from "@/lib/webhook-secret";
import type { Attachment } from "@/lib/types";

/**
 * Sends phone notifications for new 1:1 chat messages.
 *
 * Called by a Supabase Database Webhook on `messages` INSERT, with the header
 * `x-push-secret: <PUSH_WEBHOOK_SECRET>`. Recipients are the other member of
 * the 1:1 chat; group chats and channels never notify. Subscriptions come from
 * the "Phone notifications" switch, which only shows on the website itself
 * (not inside an embedding widget).
 */

type NewMessage = {
  id: string;
  room_id: string;
  user_id: string;
  content: string | null;
  attachments: Attachment[] | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: NewMessage | null;
};

const PREVIEW_LENGTH = 140;

export async function POST(request: Request) {
  if (!hasValidSecret(request.headers.get("x-push-secret"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return new Response("VAPID keys are not configured", { status: 500 });
  }

  const payload = (await request.json().catch(() => null)) as WebhookPayload | null;
  const message = payload?.record;
  if (payload?.type !== "INSERT" || payload.table !== "messages" || !message) {
    return Response.json({ skipped: "not a new message" });
  }

  const db = createAdminClient();

  const { data: room } = await db
    .from("rooms")
    .select("kind")
    .eq("id", message.room_id)
    .maybeSingle<{ kind: string }>();
  if (room?.kind !== "direct") {
    return Response.json({ skipped: "not a 1:1 chat" });
  }

  const [{ data: members }, { data: sender }] = await Promise.all([
    db
      .from("room_members")
      .select("user_id")
      .eq("room_id", message.room_id)
      .neq("user_id", message.user_id)
      .overrideTypes<{ user_id: string }[], { merge: false }>(),
    db
      .from("profiles")
      .select("username")
      .eq("id", message.user_id)
      .maybeSingle<{ username: string }>(),
  ]);
  const recipients = (members ?? []).map((m) => m.user_id);
  if (recipients.length === 0) return Response.json({ sent: 0 });

  const { data: subscriptions } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", recipients)
    .overrideTypes<{ endpoint: string; p256dh: string; auth: string }[], { merge: false }>();
  if (!subscriptions?.length) return Response.json({ sent: 0 });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || new URL(request.url).origin,
    publicKey,
    privateKey,
  );

  const notification = JSON.stringify({
    title: sender?.username ?? "New message",
    body: preview(message),
    url: `/chat/${message.room_id}`,
    tag: message.room_id,
  });

  // Push services answer 404/410 for subscriptions that no longer exist
  // (app uninstalled, permission revoked): forget those.
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notification,
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else console.error("Push failed", status, (error as Error).message);
      }
    }),
  );
  if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);

  return Response.json({ sent, removed: gone.length });
}

function preview(message: NewMessage): string {
  const text = plainText(message.content ?? "");
  if (text) return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text;
  const files = message.attachments?.length ?? 0;
  if (files === 1) return "📎 Sent an attachment";
  if (files > 1) return `📎 Sent ${files} attachments`;
  return "New message";
}
