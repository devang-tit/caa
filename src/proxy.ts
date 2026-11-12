import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, image optimization files, and what
    // must work without a session: the push service worker, the app
    // manifest, and the database webhooks (they check their own secret).
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|api/push|api/cleanup|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
