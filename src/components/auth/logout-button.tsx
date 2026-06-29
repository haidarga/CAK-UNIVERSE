"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

/** Signs the user out and returns them to /login. */
export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    try {
      await createBrowserSupabase().auth.signOut();
    } catch {
      // Even if sign-out errors, route to login so the user isn't stuck.
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={loading}
      aria-label="Sign out"
      className={cn(
        "grid size-9 place-items-center rounded-lg border border-transparent text-muted outline-none transition-colors duration-200",
        "hover:bg-surface-2/60 hover:text-fg focus-visible:ring-2 focus-visible:ring-primary/60",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <LogOut className="size-4" aria-hidden />
      )}
    </button>
  );
}
