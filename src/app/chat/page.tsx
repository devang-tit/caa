import { ChatIcon } from "@/components/icons";

export default function ChatIndexPage() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 p-8 text-center md:flex">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-mine text-accent-text">
        <ChatIcon className="h-8 w-8" />
      </span>
      <h2 className="text-lg font-semibold">Pick a chat or channel</h2>
      <p className="max-w-sm text-sm text-muted">
        Use the pencil icon to message someone or start a group, or the # icon to create a channel.
        Everything — messages, reactions, read receipts — updates live.
      </p>
    </div>
  );
}
