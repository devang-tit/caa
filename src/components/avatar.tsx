import type { Presence } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

// Soft tinted backgrounds with dark initials, like Teams' default avatars.
const PALETTE = [
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200",
];

const SIZES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-16 w-16 text-xl",
};

const DOT_SIZES = {
  xs: "h-2 w-2",
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
  xl: "h-4 w-4",
};

const DOT_COLORS: Record<Presence, string> = {
  available: "bg-success",
  busy: "bg-danger",
  dnd: "bg-danger",
  away: "bg-amber-400",
  offline: "bg-[color:var(--avatar-ring,var(--surface))] shadow-[inset_0_0_0_1.5px_var(--muted)]",
};

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** "Alex Kim" → "AK"; single words give one letter for people, two for rooms. */
function initials(name: string, square: boolean) {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0]);
  if (words.length === 1) return first.slice(0, square ? 2 : 1).join("");
  return first[0] + Array.from(words[1])[0];
}

/** Small status dot (Teams-style). The ring blends with `--avatar-ring`. */
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
  /** Circles for people, rounded squares for rooms. */
  shape?: "circle" | "square";
  /** Shows a status dot; its ring uses `--avatar-ring` (default: surface). */
  status?: Presence;
  className?: string;
}) {
  return (
    <span
      title={name}
      aria-hidden
      className={`relative inline-flex shrink-0 select-none items-center justify-center font-semibold uppercase ${SIZES[size]} ${shape === "square" ? "rounded-md" : "rounded-full"} ${colorFor(id)} ${className}`}
    >
      {initials(name, shape === "square")}
      {status && (
        <StatusDot status={status} className={`absolute -bottom-0.5 -right-0.5 ${DOT_SIZES[size]}`} />
      )}
    </span>
  );
}
