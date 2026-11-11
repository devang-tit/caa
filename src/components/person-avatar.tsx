"use client";

import type { ComponentProps } from "react";
import { usePeople, usePresence } from "./session-provider";
import { Avatar } from "./avatar";

/** A person's avatar with their live status dot. Suspends: use behind <Suspense>. */
export function PersonAvatar({
  userId,
  name,
  showStatus = true,
  ...props
}: { userId: string; name?: string; showStatus?: boolean } & Omit<
  ComponentProps<typeof Avatar>,
  "id" | "name" | "status" | "shape"
>) {
  const people = usePeople();
  const presence = usePresence(userId);
  return (
    <Avatar
      id={userId}
      name={name ?? people.get(userId)?.username ?? "?"}
      status={showStatus ? presence : undefined}
      {...props}
    />
  );
}
