import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        data: ['"Fira Code"', "ui-monospace", "monospace"],
      },
      colors: {
        // ── Script Writer Studio (CAKGPT) tokens. CAKGPT components use these
        //    un-prefixed names verbatim. They map to `--sw-*` CSS vars that are
        //    defined ONLY inside `.sw-root` (see globals.css), so they never
        //    affect the ecosystem's own pages. The colliding names
        //    (surface/muted/border/primary/accent/warning) are handled by
        //    re-scoping the ecosystem vars inside `.sw-root` instead. ──
        onPrimary: "rgb(var(--sw-onPrimary) / <alpha-value>)",
        secondary: "rgb(var(--sw-secondary) / <alpha-value>)",
        background: "rgb(var(--sw-background) / <alpha-value>)",
        foreground: "rgb(var(--sw-foreground) / <alpha-value>)",
        text: "rgb(var(--sw-text) / <alpha-value>)",
        mutedText: "rgb(var(--sw-mutedText) / <alpha-value>)",
        destructive: "rgb(var(--sw-destructive) / <alpha-value>)",
        ring: "rgb(var(--sw-ring) / <alpha-value>)",
        nit: "rgb(var(--sw-nit) / <alpha-value>)",
        blocker: "rgb(var(--sw-destructive) / <alpha-value>)",
        // Semantic tokens mapped to CSS custom properties (see globals.css)
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        // Warmup phase + status palette
        phase: {
          cold: "rgb(var(--phase-cold) / <alpha-value>)",
          warming: "rgb(var(--phase-warming) / <alpha-value>)",
          warm: "rgb(var(--phase-warm) / <alpha-value>)",
          active: "rgb(var(--phase-active) / <alpha-value>)",
          paused: "rgb(var(--phase-paused) / <alpha-value>)",
          flagged: "rgb(var(--phase-flagged) / <alpha-value>)",
        },
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      borderRadius: {
        bento: "1.25rem",
      },
      boxShadow: {
        glass: "0 8px 32px -8px rgba(0,0,0,0.45), inset 0 1px 0 0 rgba(255,255,255,0.06)",
        "glass-hover": "0 16px 48px -12px rgba(0,0,0,0.55), inset 0 1px 0 0 rgba(255,255,255,0.10)",
      },
      backdropBlur: {
        bento: "20px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-up": "fade-up 300ms cubic-bezier(0.16,1,0.3,1) both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
