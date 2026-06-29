import { Suspense } from "react";
import { Sparkles, ShieldCheck, Loader2 } from "lucide-react";
import LoginForm from "@/components/auth/login-form";

export const metadata = {
  title: "Sign in · CAK AI Ecosystem",
};

/** Public login route (NOT under (dash) — renders unauthenticated). */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-2xl border border-primary/40 bg-primary/15">
            <Sparkles className="size-6 text-primary" aria-hidden />
          </span>
          <div className="leading-tight">
            <h1 className="text-xl font-bold tracking-tight text-fg">CAK AI Ecosystem</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              Internal Platform
            </p>
          </div>
        </div>

        {/* Glass login card */}
        <div className="glass p-6 sm:p-7">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-fg">Sign in</h2>
            <p className="mt-1 text-sm text-muted">
              Welcome back. Sign in with your provisioned account.
            </p>
          </div>

          <Suspense
            fallback={
              <div className="flex items-center justify-center py-10 text-muted">
                <Loader2 className="size-5 animate-spin" aria-hidden />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        {/* Provisioning note */}
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted/80">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          Internal platform — accounts are provisioned by admin.
        </p>
      </div>
    </main>
  );
}
