import Link from "next/link";

export default function RoomNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h2 className="text-lg font-semibold">Room not found</h2>
      <p className="text-sm text-muted">It may have been removed, or the link is wrong.</p>
      <Link href="/chat" className="btn-secondary mt-3">
        Back to rooms
      </Link>
    </div>
  );
}
