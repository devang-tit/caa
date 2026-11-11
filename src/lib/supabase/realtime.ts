import type {
  RealtimeChannel,
  RealtimeChannelOptions,
  SupabaseClient,
} from "@supabase/supabase-js";

type Status = Parameters<NonNullable<Parameters<RealtimeChannel["subscribe"]>[0]>>[0];

// Topic → promise that settles once the previous channel for it has left.
const leaving = new Map<string, Promise<unknown>>();

/**
 * Subscribe to a Realtime channel from a React effect and return the cleanup.
 *
 * `supabase.channel(topic)` hands back the *existing* channel while an old one
 * with the same topic is still leaving. Under React Strict Mode / Fast Refresh
 * an effect unmounts and remounts immediately, so a naive effect would try to
 * attach listeners to a channel that's mid-teardown (and throw). This waits
 * for the previous channel to fully leave before creating a fresh one.
 */
export function subscribeToChannel(
  supabase: SupabaseClient,
  topic: string,
  options: RealtimeChannelOptions,
  register: (channel: RealtimeChannel) => void,
  onStatus?: (status: Status, channel: RealtimeChannel, err?: Error) => void,
): () => void {
  let cancelled = false;
  let channel: RealtimeChannel | null = null;

  void (async () => {
    await leaving.get(topic);
    if (cancelled) return;
    const ch = supabase.channel(topic, options);
    channel = ch;
    register(ch);
    ch.subscribe((status, err) => onStatus?.(status, ch, err));
  })();

  return () => {
    cancelled = true;
    if (!channel) return;
    const done = supabase.removeChannel(channel);
    leaving.set(topic, done);
    void done.finally(() => {
      if (leaving.get(topic) === done) leaving.delete(topic);
    });
  };
}
