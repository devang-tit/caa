import Link from "next/link";
import { ChatIcon } from "@/components/icons";

export default function RoomNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="mb-2 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-soft text-accent-text">
        <ChatIcon className="h-8 w-8" />
      </span>
      <h2 className="text-lg font-semibold">Chat not found</h2>
      <p className="max-w-xs text-sm text-muted">It may have been removed, or the link is wrong.</p>
      <Link href="/chat" className="btn-primary mt-3">
        Back to chats
      </Link>
    </div>
  );
}
