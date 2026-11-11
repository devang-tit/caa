const COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
];

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function Avatar({
  id,
  name,
  size = "md",
  className = "",
}: {
  id: string;
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const dims = size === "sm" ? "h-6 w-6 text-[10px]" : "h-9 w-9 text-sm";
  return (
    <span
      title={name}
      aria-hidden
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold uppercase text-white ${dims} ${colorFor(id)} ${className}`}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}
