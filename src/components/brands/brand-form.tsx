"use client";

import type { Brand } from "@/lib/types";

export type Platform = "tiktok" | "instagram" | "both";

/** Editable shape — arrays stay arrays; nullable strings become "". */
export interface BrandDraft {
  id?: string;
  name: string;
  slug?: string;
  platform: Platform;
  status: string;
  campaign_tagline: string;
  emotional_pillars: string[];
  content_formats: string[];
  guidelines: string;
  guardrails: string[];
  approved_claims: string[];
  script_format: string;
  cta_rules: string;
  hashtag_sets: string[];
  products: string[];
  hero_products: string[];
  posting_day: string;
  posting_hour: string;
}

export const EMPTY_DRAFT: BrandDraft = {
  name: "",
  platform: "both",
  status: "active",
  campaign_tagline: "",
  emotional_pillars: [],
  content_formats: [],
  guidelines: "",
  guardrails: [],
  approved_claims: [],
  script_format: "",
  cta_rules: "",
  hashtag_sets: [],
  products: [],
  hero_products: [],
  posting_day: "",
  posting_hour: "",
};

/** Brand row -> editable draft. */
export function brandToDraft(b: Brand): BrandDraft {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    platform: b.platform,
    status: b.status ?? "active",
    campaign_tagline: b.campaign_tagline ?? "",
    emotional_pillars: b.emotional_pillars ?? [],
    content_formats: b.content_formats ?? [],
    guidelines: b.guidelines ?? "",
    guardrails: b.guardrails ?? [],
    approved_claims: b.approved_claims ?? [],
    script_format: b.script_format ?? "",
    cta_rules: b.cta_rules ?? "",
    hashtag_sets: b.hashtag_sets ?? [],
    products: b.products ?? [],
    hero_products: b.hero_products ?? [],
    posting_day: b.posting_sweet_spot?.day ?? "",
    posting_hour: b.posting_sweet_spot?.hour ?? "",
  };
}

/** Draft -> API payload (arrays cleaned server-side; merge sweet spot). */
export function draftToPayload(d: BrandDraft): Record<string, unknown> {
  const sweet =
    d.posting_day || d.posting_hour
      ? { day: d.posting_day || undefined, hour: d.posting_hour || undefined }
      : null;
  return {
    name: d.name,
    platform: d.platform,
    status: d.status,
    campaign_tagline: d.campaign_tagline,
    emotional_pillars: d.emotional_pillars,
    content_formats: d.content_formats,
    guidelines: d.guidelines,
    guardrails: d.guardrails,
    approved_claims: d.approved_claims,
    script_format: d.script_format,
    cta_rules: d.cta_rules,
    hashtag_sets: d.hashtag_sets,
    products: d.products,
    hero_products: d.hero_products,
    posting_sweet_spot: sweet,
  };
}

const INPUT =
  "bezel w-full rounded-xl bg-surface-2/60 px-3 py-2 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg/90">
        {label}
        {hint && <span className="ml-1.5 font-normal text-muted">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

interface BrandFormProps {
  draft: BrandDraft;
  onChange: (patch: Partial<BrandDraft>) => void;
}

/** Controlled brand profile form. Array fields edit as one-per-line text. */
export default function BrandForm({ draft, onChange }: BrandFormProps) {
  const list = (key: keyof BrandDraft) => ({
    value: (draft[key] as string[]).join("\n"),
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      // keep raw lines while typing; empties/whitespace are cleaned server-side
      onChange({ [key]: e.target.value.split("\n") } as Partial<BrandDraft>),
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Identity */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nama brand">
          <input
            className={INPUT}
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="mis. Glow Lokal"
            maxLength={120}
          />
        </Field>
        <Field label="Platform">
          <select
            className={INPUT}
            value={draft.platform}
            onChange={(e) => onChange({ platform: e.target.value as Platform })}
          >
            <option value="both">TikTok + Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
          </select>
        </Field>
        <Field label="Tagline kampanye" hint="opsional">
          <input
            className={INPUT}
            value={draft.campaign_tagline}
            onChange={(e) => onChange({ campaign_tagline: e.target.value })}
            placeholder="mis. Glow-mu, cerita-mu"
            maxLength={160}
          />
        </Field>
        <Field label="Status">
          <select
            className={INPUT}
            value={draft.status}
            onChange={(e) => onChange({ status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </Field>
      </section>

      {/* Voice & rules */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Emotional pillars" hint="1 per baris">
          <textarea className={`${INPUT} min-h-[88px] resize-y`} {...list("emotional_pillars")} placeholder={"percaya diri\nrelatable\nempowering"} />
        </Field>
        <Field label="Content formats" hint="1 per baris">
          <textarea className={`${INPUT} min-h-[88px] resize-y`} {...list("content_formats")} placeholder={"talking head\nGRWM\nstorytelling"} />
        </Field>
        <Field label="Guardrails — hindari/jangan" hint="1 per baris">
          <textarea className={`${INPUT} min-h-[88px] resize-y`} {...list("guardrails")} placeholder={"klaim medis\nbody shaming"} />
        </Field>
        <Field label="Approved claims — boleh diklaim" hint="1 per baris">
          <textarea className={`${INPUT} min-h-[88px] resize-y`} {...list("approved_claims")} placeholder={"BPOM terdaftar\nhalal"} />
        </Field>
        <Field label="Guidelines / brand voice" hint="opsional">
          <textarea
            className={`${INPUT} min-h-[88px] resize-y sm:col-span-2`}
            value={draft.guidelines}
            onChange={(e) => onChange({ guidelines: e.target.value })}
            placeholder="Cara ngomong, do & don't, tone…"
          />
        </Field>
      </section>

      {/* Script & distribution */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Script format" hint="opsional">
          <input
            className={INPUT}
            value={draft.script_format}
            onChange={(e) => onChange({ script_format: e.target.value })}
            placeholder="mis. hook–value–CTA, <45 detik"
          />
        </Field>
        <Field label="CTA rules" hint="opsional">
          <input
            className={INPUT}
            value={draft.cta_rules}
            onChange={(e) => onChange({ cta_rules: e.target.value })}
            placeholder="mis. selalu arahin ke bio"
          />
        </Field>
        <Field label="Hashtag sets" hint="1 per baris">
          <textarea className={`${INPUT} min-h-[72px] resize-y`} {...list("hashtag_sets")} placeholder={"#skincarelokal\n#glowup"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Posting — hari">
            <input
              className={INPUT}
              value={draft.posting_day}
              onChange={(e) => onChange({ posting_day: e.target.value })}
              placeholder="mis. Sabtu"
            />
          </Field>
          <Field label="Posting — jam">
            <input
              className={INPUT}
              value={draft.posting_hour}
              onChange={(e) => onChange({ posting_hour: e.target.value })}
              placeholder="mis. 19:00"
            />
          </Field>
        </div>
      </section>

      {/* Products */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Produk" hint="1 per baris">
          <textarea className={`${INPUT} min-h-[72px] resize-y`} {...list("products")} placeholder={"Serum Vitamin C\nSunscreen SPF50"} />
        </Field>
        <Field label="Hero products — andalan" hint="1 per baris">
          <textarea className={`${INPUT} min-h-[72px] resize-y`} {...list("hero_products")} placeholder={"Serum Vitamin C"} />
        </Field>
      </section>
    </div>
  );
}
