import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, type ActivityItem } from "@/lib/types";
import { ListSkeleton, PageShell } from "../page-shell";
import { ActivityFeed } from "./activity-feed";

export const metadata: Metadata = { title: "Activity · Realtime Chat" };

export default function ActivityPage() {
  return (
    <PageShell title="Activity" description="Mentions, replies and reactions to your messages">
      <Suspense fallback={<ListSkeleton />}>
        <ActivityLoader />
      </Suspense>
    </PageShell>
  );
}

async function ActivityLoader() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select(ACTIVITY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(50)
    .overrideTypes<ActivityItem[], { merge: false }>();
  return <ActivityFeed meId={me.id} initialItems={data ?? []} />;
}
