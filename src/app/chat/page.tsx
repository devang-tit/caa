export default function ChatIndexPage() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-8 text-center md:flex">
      <span className="text-4xl">👋</span>
      <h2 className="text-lg font-semibold">Pick a room to start chatting</h2>
      <p className="max-w-sm text-sm text-muted">
        Choose a room on the left or create a new one. Messages, edits and deletes show up for
        everyone instantly.
      </p>
    </div>
  );
}
