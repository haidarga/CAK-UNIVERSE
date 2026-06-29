"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, Lock, AlertCircle, ArrowRight, Wand2 } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

type Mode = "password" | "magic";

/** Email + password sign-in (with optional magic-link fallback). */
export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/team";

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMagicSent(false);
    setLoading(true);

    try {
      const supabase = createBrowserSupabase();

      if (mode === "magic") {
        const redirectTo =
          typeof window !== "undefined" ? `${window.location.origin}${next}` : undefined;
        const { error: linkError } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (linkError) throw linkError;
        setMagicSent(true);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field
        id="email"
        type="email"
        label="Email"
        icon={Mail}
        value={email}
        autoComplete="email"
        autoFocus
        placeholder="you@cakai.dev"
        onChange={setEmail}
      />

      {mode === "password" && (
        <Field
          id="password"
          type="password"
          label="Password"
          icon={Lock}
          value={password}
          autoComplete="current-password"
          placeholder="••••••••"
          onChange={setPassword}
        />
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      {magicSent && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
        >
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Magic link sent. Check your inbox to finish signing in.</span>
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className={cn(
          "mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/20 px-4 text-sm font-semibold text-fg outline-none transition-colors duration-200",
          "hover:bg-primary/30 focus-visible:ring-2 focus-visible:ring-primary/60",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : mode === "magic" ? (
          <Wand2 className="size-4" aria-hidden />
        ) : (
          <ArrowRight className="size-4" aria-hidden />
        )}
        {loading
          ? "Signing in…"
          : mode === "magic"
            ? "Send magic link"
            : "Sign in"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "password" ? "magic" : "password"));
          setError(null);
          setMagicSent(false);
        }}
        className="text-center text-xs font-medium text-muted outline-none transition-colors hover:text-fg focus-visible:underline"
      >
        {mode === "password" ? "Use a magic link instead" : "Use email + password instead"}
      </button>
    </form>
  );
}

interface FieldProps {
  id: string;
  type: "email" | "password";
  label: string;
  icon: typeof Mail;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  onChange: (v: string) => void;
}

function Field({
  id,
  type,
  label,
  icon: Icon,
  value,
  placeholder,
  autoComplete,
  autoFocus,
  onChange,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          id={id}
          name={id}
          type={type}
          required
          value={value}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-11 w-full rounded-xl border border-border/70 bg-surface-2/50 pl-10 pr-3 text-sm text-fg outline-none transition-colors duration-200",
            "placeholder:text-muted/60 focus:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/40",
          )}
        />
      </div>
    </div>
  );
}
