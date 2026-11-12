/**
 * Fallbacks for browser APIs that only exist in secure contexts.
 *
 * An https page in an iframe is not a secure context when the top-level page
 * is plain http on anything but localhost (e.g. http://192.168.x.x:3000), so
 * when the app is embedded that way crypto.randomUUID and navigator.clipboard
 * are missing.
 */

/** A v4 UUID, from crypto.randomUUID() when available. */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues works in insecure contexts too.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Copies text to the clipboard. Falls back to a hidden textarea and
 * execCommand("copy") where navigator.clipboard is missing. Call it straight
 * from a click handler: the fallback needs the click's user activation.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission denied: try the fallback.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    document.execCommand("copy");
  } finally {
    area.remove();
  }
}
