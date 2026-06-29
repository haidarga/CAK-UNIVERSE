import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string | null | undefined;
  /** Pixel diameter. Defaults to 32 (still ≥ visual target inside touch wrappers). */
  size?: number;
  className?: string;
}

// Deterministic palette — picked by hashing the name so a person keeps one color.
const PALETTE = [
  "bg-primary/20 text-primary",
  "bg-accent/20 text-accent",
  "bg-phase-warm/20 text-phase-warm",
  "bg-phase-active/20 text-phase-active",
  "bg-phase-warming/20 text-phase-warming",
  "bg-phase-flagged/20 text-phase-flagged",
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Initials circle with a stable per-name color. */
export default function Avatar({ name, size = 32, className }: AvatarProps) {
  const label = name?.trim() || "Unassigned";
  const tone = name ? PALETTE[hash(name) % PALETTE.length] : "bg-surface-2/70 text-muted";
  const fontSize = Math.max(10, Math.round(size * 0.38));

  return (
    <span
      aria-label={label}
      title={label}
      style={{ width: size, height: size, fontSize }}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold leading-none ring-1 ring-white/10",
        tone,
        className,
      )}
    >
      {name ? initials(name) : "?"}
    </span>
  );
}
