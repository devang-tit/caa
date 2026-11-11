import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { SAVED_COLUMNS, type SavedItem } from "@/lib/types";
import { ListSkeleton, PageShell } from "../page-shell";
import { SavedList } from "./saved-list";

export const metadata: Metadata = { title: "Saved · Realtime Chat" };

export default function SavedPage() {
  return (
    <PageShell title="Saved" description="Messages you've saved for later">
      <Suspense fallback={<ListSkeleton />}>
        <SavedLoader />
      </Suspense>
    </PageShell>
  );
}

async function SavedLoader() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_messages")
    .select(SAVED_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100)
    .overrideTypes<SavedItem[], { merge: false }>();
  return <SavedList meId={me.id} initialItems={(data ?? []).filter((s) => s.messages)} />;
}
