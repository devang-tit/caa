import type { Presence } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

// Soft two-tone gradients with white initials; each person keeps one hue.
const PALETTE = [
  { bg: "from-rose-400 to-pink-600", name: "text-rose-600 dark:text-rose-400" },
  { bg: "from-orange-400 to-red-500", name: "text-orange-600 dark:text-orange-400" },
  { bg: "from-amber-400 to-orange-500", name: "text-amber-600 dark:text-amber-400" },
  { bg: "from-lime-400 to-green-600", name: "text-green-600 dark:text-lime-400" },
  { bg: "from-emerald-400 to-teal-600", name: "text-emerald-600 dark:text-emerald-400" },
  { bg: "from-cyan-400 to-sky-600", name: "text-sky-600 dark:text-cyan-400" },
  { bg: "from-sky-400 to-blue-600", name: "text-blue-600 dark:text-sky-400" },
  { bg: "from-indigo-400 to-indigo-600", name: "text-indigo-600 dark:text-indigo-300" },
  { bg: "from-violet-400 to-purple-600", name: "text-violet-600 dark:text-violet-400" },
  { bg: "from-fuchsia-400 to-pink-600", name: "text-fuchsia-600 dark:text-fuchsia-400" },
];

const SIZES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-[13px]",
  lg: "h-10 w-10 text-sm",
  row: "h-12 w-12 text-base",
  xl: "h-20 w-20 text-2xl",
};

const DOT_SIZES = {
  xs: "h-2 w-2",
  sm: "h-2.5 w-2.5",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
  row: "h-3.5 w-3.5",
  xl: "h-5 w-5",
};

const DOT_COLORS: Record<Presence, string> = {
  available: "bg-success",
  busy: "bg-danger",
  dnd: "bg-danger",
  away: "bg-warning",
  offline: "bg-[color:var(--avatar-ring,var(--surface))] shadow-[inset_0_0_0_1.5px_var(--muted)]",
};

function paletteFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** Text color for a person's name, matching their avatar. */
export function nameColor(id: string) {
  return paletteFor(id).name;
}

/** "Alex Kim" → "AK"; single words give one letter for people, two for rooms. */
function initials(name: string, square: boolean) {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0]);
  if (words.length === 1) return first.slice(0, square ? 2 : 1).join("");
  return first[0] + Array.from(words[1])[0];
}

/** Small status dot. The ring blends with `--avatar-ring`. */
export function StatusDot({ status, className = "" }: { status: Presence; className?: string }) {
  return (
    <span
      title={STATUS_LABELS[status]}
      className={`inline-flex items-center justify-center rounded-full ring-2 ring-[color:var(--avatar-ring,var(--surface))] ${DOT_COLORS[status]} ${className}`}
    >
      {status === "dnd" && <span className="h-[1.5px] w-1/2 rounded-full bg-white" />}
    </span>
  );
}

export function Avatar({
  id,
  name,
  size = "md",
  shape = "circle",
  status,
  className = "",
}: {
  id: string;
  name: string;
  size?: keyof typeof SIZES;
  /** Circles for people, rounded squares for channels. */
  shape?: "circle" | "square";
  /** Shows a status dot; its ring uses `--avatar-ring` (default: surface). */
  status?: Presence;
  className?: string;
}) {
  return (
    <span
      title={name}
      aria-hidden
      className={`relative inline-flex shrink-0 select-none items-center justify-center bg-linear-to-br font-semibold uppercase text-white ${SIZES[size]} ${shape === "square" ? "rounded-[30%]" : "rounded-full"} ${paletteFor(id).bg} ${className}`}
    >
      {initials(name, shape === "square")}
      {status && (
        <StatusDot
          status={status}
          className={`absolute ${size === "row" || size === "xl" ? "bottom-0 right-0" : "-bottom-0.5 -right-0.5"} ${DOT_SIZES[size]}`}
        />
      )}
    </span>
  );
}

/** Placeholder avatar for a group chat (no single person to show). */
export function GroupAvatar({ size = "md" }: { size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text ${SIZES[size]}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-1/2 w-1/2"
      >
        <circle cx="9" cy="8" r="3.25" />
        <path d="M3.5 19c.6-3 2.8-4.75 5.5-4.75S13.9 16 14.5 19" />
        <circle cx="16.5" cy="9" r="2.5" />
        <path d="M15.5 14.4c2.3.1 4.2 1.6 4.8 4.1" />
      </svg>
    </span>
  );
}
