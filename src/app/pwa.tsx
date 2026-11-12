"use client";

import { useEffect } from "react";
import { startPwa } from "@/lib/pwa";

/** Registers the service worker and listens for the install prompt. */
export function Pwa() {
  useEffect(() => startPwa(), []);
  return null;
}
