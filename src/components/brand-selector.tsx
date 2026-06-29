"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

interface BrandSelectorProps {
  brands: { id: string; slug: string; name: string }[];
  /** Current brand slug. */
  selected?: string;
}

/** URL-state brand selector: writes ?brand=<slug> and refreshes the page. */
export default function BrandSelector({ brands, selected }: BrandSelectorProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(slug: string) {
    const next = new URLSearchParams(params.toString());
    next.set("brand", slug);
    startTransition(() => router.push(`?${next.toString()}`));
  }

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Select brand</span>
      <select
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={brands.length === 0 || pending}
        className="min-h-[44px] cursor-pointer appearance-none rounded-xl border border-border bg-surface-2/60 py-2 pl-3.5 pr-9 text-sm font-medium text-fg outline-none transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {brands.length === 0 && <option value="">No brands</option>}
        {brands.map((b) => (
          <option key={b.id} value={b.slug}>
            {b.name}
          </option>
        ))}
      </select>
      {pending ? (
        <Loader2
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted"
          aria-hidden
        />
      ) : (
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
      )}
    </label>
  );
}
