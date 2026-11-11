"use client";

import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToChannel } from "@/lib/supabase/realtime";
import type { Conversation, CurrentUser, Presence, Profile } from "@/lib/types";

type Session = {
  mePromise: Promise<CurrentUser | null>;
  peoplePromise: Promise<Profile[]>;
  conversationsPromise: Promise<Conversation[]>;
  /** Profiles changed since the page loaded (status, new sign-ups, renames). */
  profileUpdates: Record<string, Profile>;
  /** Users with the app open right now. */
  online: ReadonlySet<string>;
  setLocalProfile: (profile: Profile) => void;
};

const SessionContext = createContext<Session | null>(null);

/**
 * App-wide session state. The server starts the queries and passes the
 * promises down (not awaited), so this provider stays in the static shell;
 * components unwrap them with `use()` behind their own <Suspense>.
 */
export function SessionProvider({
  mePromise,
  peoplePromise,
  conversationsPromise,
  children,
}: {
  mePromise: Promise<CurrentUser | null>;
  peoplePromise: Promise<Profile[]>;
  conversationsPromise: Promise<Conversation[]>;
  children: ReactNode;
}) {
  const [profileUpdates, setProfileUpdates] = useState<Record<string, Profile>>({});
  const [online, setOnline] = useState<ReadonlySet<string>>(() => new Set());

  // One global channel: who's online (Presence) + profile changes (status).
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    const remember = (row: unknown) => {
      const profile = row as Partial<Profile>;
      if (!profile.id || !profile.username) return;
      setProfileUpdates((prev) => ({
        ...prev,
        [profile.id!]: {
          id: profile.id!,
          username: profile.username!,
          status: profile.status ?? "available",
        },
      }));
    };

    void mePromise.then((me) => {
      if (cancelled || !me) return;
      unsubscribe = subscribeToChannel(
        createClient(),
        "online-users",
        { config: { presence: { key: me.id } } },
        (channel) => {
          channel
            .on("presence", { event: "sync" }, () => {
              setOnline(new Set(Object.keys(channel.presenceState())));
            })
            .on(
              "postgres_changes",
              { event: "INSERT", schema: "public", table: "profiles" },
              ({ new: row }) => remember(row),
            )
            .on(
              "postgres_changes",
              { event: "UPDATE", schema: "public", table: "profiles" },
              ({ new: row }) => remember(row),
            );
        },
        (status, channel) => {
          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            void channel.track({ online_at: new Date().toISOString() });
          }
        },
      );
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [mePromise]);

  const value = useMemo<Session>(
    () => ({
      mePromise,
      peoplePromise,
      conversationsPromise,
      profileUpdates,
      online,
      setLocalProfile: (profile) =>
        setProfileUpdates((prev) => ({ ...prev, [profile.id]: profile })),
    }),
    [mePromise, peoplePromise, conversationsPromise, profileUpdates, online],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

function useSession() {
  const session = use(SessionContext);
  if (!session) throw new Error("Session hooks must be used inside <SessionProvider>");
  return session;
}

/** The signed-in user with live status. Suspends: call it behind <Suspense>. */
export function useMe(): CurrentUser | null {
  const { mePromise, profileUpdates } = useSession();
  const me = use(mePromise);
  if (!me) return null;
  const update = profileUpdates[me.id];
  return update ? { ...me, username: update.username, status: update.status } : me;
}

/** Everyone, by id, with live updates. Suspends: call it behind <Suspense>. */
export function usePeople(): ReadonlyMap<string, Profile> {
  const { peoplePromise, profileUpdates } = useSession();
  const base = use(peoplePromise);
  return useMemo(() => {
    const map = new Map(base.map((p) => [p.id, p]));
    for (const p of Object.values(profileUpdates)) map.set(p.id, p);
    return map;
  }, [base, profileUpdates]);
}

/** What a user's avatar dot should show. Suspends: call it behind <Suspense>. */
export function usePresence(userId: string): Presence {
  const { online } = useSession();
  const me = useMe();
  const people = usePeople();
  if (userId !== me?.id && !online.has(userId)) return "offline";
  return people.get(userId)?.status ?? "available";
}

export function useConversationsPromise() {
  return useSession().conversationsPromise;
}

export function useSetLocalProfile() {
  return useSession().setLocalProfile;
}
