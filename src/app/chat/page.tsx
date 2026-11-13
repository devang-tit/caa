import { ChatIcon } from "@/components/icons";

export default function ChatIndexPage() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-4 p-8 text-center md:flex">
      <div className="relative">
        <span className="absolute inset-0 -z-0 scale-150 rounded-full bg-accent/15 blur-2xl" />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-[28px] bg-linear-to-br from-accent to-accent-hover text-accent-foreground shadow-float">
          <ChatIcon className="h-10 w-10 fill-current/20" strokeWidth={1.7} />
        </span>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold tracking-tight">Pick up where you left off</h2>
        <p className="max-w-sm text-sm text-muted">
          Choose a chat or channel on the left, or start a new one with the compose button.
          Messages, reactions and read receipts all update live.
        </p>
      </div>
    </div>
  );
}
