/* eslint-disable no-console */
// ============================================================
// CAK AI Ecosystem — database seed script.
//
//   npm run seed   ->   tsx scripts/seed.ts
//
// RUN ORDER: apply supabase/migrations/001_initial_schema.sql FIRST,
// then create .env.local (NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY), THEN run `npm run seed`.
//
// Idempotent + re-runnable:
//   - brands  : upsert on `slug`
//   - personas/accounts/hooks/pipeline/trends/kpi : delete-existing-for-brand
//     then re-insert (keyed off the freshly upserted brand id).
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the
// environment, falling back to a tiny manual `.env.local` parser so it
// works whether or not the caller exported them. No new deps.
// ============================================================

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ------------------------------------------------------------
// 0. ENV LOADING  (process.env first, then manual .env.local parse)
// ------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

/** Parse a `.env.local`-style file into KEY=VALUE pairs. Best-effort. */
function parseDotEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // strip matching surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadEnv(): { url: string; serviceKey: string } {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    try {
      const dotenv = parseDotEnv(
        readFileSync(resolve(PROJECT_ROOT, ".env.local"), "utf8")
      );
      url = url || dotenv.NEXT_PUBLIC_SUPABASE_URL;
      serviceKey = serviceKey || dotenv.SUPABASE_SERVICE_ROLE_KEY;
    } catch {
      // .env.local not present — fall through to the missing-vars check.
    }
  }

  if (!url || !serviceKey) {
    console.error(
      "\n[seed] Missing Supabase credentials.\n" +
        "  Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n" +
        "  Set them in your environment or in .env.local at the project root.\n" +
        "  Also make sure migration 001_initial_schema.sql has been applied.\n"
    );
    process.exit(1);
  }

  return { url, serviceKey };
}

// ------------------------------------------------------------
// 1. HELPERS / CONSTANTS
// ------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;

// Daily post limit per phase — mirrors src/lib/constants.ts PHASE_POST_LIMITS.
const PHASE_POST_LIMITS: Record<string, number> = {
  cold: 1,
  warming: 2,
  warm: 3,
  active: 5,
  paused: 0,
};

const ACCOUNTS_PER_BRAND = 6;
const KPI_DAYS = 14;
const KPI_BATCH_SIZE = 200;

/** ISO string for `n` days ago (n may be fractional; negative = future). */
const daysAgo = (n: number): string =>
  new Date(Date.now() - n * DAY_MS).toISOString();

/** YYYY-MM-DD for `n` days ago (for `date` columns). */
const dateAgo = (n: number): string =>
  new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

function fail(label: string, error: unknown): never {
  console.error(`\n[seed] FAILED at: ${label}`);
  console.error(error);
  process.exit(1);
}

// ------------------------------------------------------------
// 2. SEED DATA — BRANDS  (ported from the master spec)
// ------------------------------------------------------------
const ACEKID_SCRIPT_FORMAT = `Title: [Judul video — hook utama]
Format: video
Emotional Angle: [Fear | Empathy | Trust]
Hook: [1 kalimat pembuka yang menahan scroll dalam 3 detik pertama]

---
Timestamp [00:00-00:05]
Lokasi: [setting / latar adegan]
Dialog: [dialog on-cam, jika ada]
VO: [voice-over / narasi]
Cut to cut: [deskripsi potongan visual]
Wardrobe: [pakaian talent]
Camera movement: [static / pan / zoom-in / handheld]

Timestamp [00:05-00:15]
Lokasi: [...]
Dialog: [...]
VO: [...]
Cut to cut: [...]
Wardrobe: [...]
Camera movement: [...]

Timestamp [00:15-00:25]
Lokasi: [...]
Dialog: [...]
VO: [...]
Cut to cut: [...]
Wardrobe: [...]
Camera movement: [...]

---
CTA: [ajakan bertindak — lembut, edukatif, tanpa hard sell]
Hashtags: #AceKid #nutrisianak #bundacerdas #infoparenting`;

interface BrandSeed {
  name: string;
  slug: string;
  platform: string;
  campaign_tagline?: string | null;
  emotional_pillars: string[];
  content_formats: string[];
  posting_sweet_spot?: { day?: string; hour?: string } | null;
  guidelines?: string | null;
  guardrails?: string[];
  approved_claims?: string[];
  script_format?: string | null;
  cta_rules?: string | null;
  products?: string[];
  hero_products?: string[];
  kpi_targets?: Record<string, number>;
}

const BRANDS: BrandSeed[] = [
  {
    name: "AceKid",
    slug: "acekid",
    platform: "tiktok",
    emotional_pillars: ["Fear", "Empathy", "Trust"],
    content_formats: ["video"],
    guardrails: [
      "NEVER claim maltodextrin is banned in EU",
      "NEVER claim maltodextrin causes cancer",
      "NEVER claim vanillin directly causes diabetes or caries",
      "NEVER claim AceKid is 'the first' without PR verification",
    ],
    approved_claims: [
      "Maltodextrin has higher GI than sugar (~110 vs ~65)",
      "Maltodextrin may cause gut microbiome concerns",
      "Vanillin is banned in China for 0-6 month formula per GB2760-2015",
      "Brands using vanillin in infant formula were fined in China 2021-2022",
    ],
    script_format: ACEKID_SCRIPT_FORMAT,
    kpi_targets: { weekly_views: 500000, eng_rate: 0.05 },
  },
  {
    name: "UGREEN",
    slug: "ugreen",
    platform: "tiktok",
    campaign_tagline: "#WhereverEverywhereAlwaysON",
    emotional_pillars: ["Problem Solution", "Edukasi Interaktif", "Lifestyle"],
    content_formats: ["slideshow", "video"],
    posting_sweet_spot: { day: "Saturday", hour: "23:00" },
    guardrails: [
      "NO hard selling",
      "NO competitor mentions",
      "NO overclaims about product specs without verified source",
      "NO 'klik link di bio' in CTA",
    ],
    products: [
      "GaN Charger",
      "Nexode 100W Desktop Charger",
      "Power bank",
      "Magnetic wireless power bank",
      "Car charger",
      "Power strip",
      "Revodok Pro 312",
      "USB-C Hub",
      "HDMI Adapter",
      "Card Reader",
      "NASync DXP4800 Plus",
      "Smart Tracker",
      "Earbuds",
      "Headphone",
    ],
    hero_products: ["NASync DXP4800 Plus", "Revodok Pro 312", "Nexode 100W"],
    kpi_targets: { weekly_views: 750000, eng_rate: 0.05 },
  },
  {
    name: "Golden Rama",
    slug: "golden-rama",
    platform: "instagram",
    emotional_pillars: ["Happy", "Curious", "Inspired"],
    content_formats: ["slideshow"],
    guidelines:
      "NEVER mention 'Golden Rama' or show logo in content. Brand reveal only in comment replies. Closings = statements, not questions. English only. High-brow declarative tone.",
    guardrails: [
      "NEVER mention Golden Rama in content",
      "NEVER show Golden Rama logo in content",
      "NEVER end with a question — only statements",
      "NEVER use Indonesian language in posts",
    ],
    kpi_targets: { weekly_views: 400000, eng_rate: 0.045 },
  },
  {
    name: "Bareksa",
    slug: "bareksa",
    platform: "tiktok",
    emotional_pillars: ["Fear/Anxiety", "Curious", "Hope"],
    content_formats: ["slideshow"],
    cta_rules:
      "ALL accounts use hardsell CTA to Bareksa. Direct download/register CTA required in every post.",
    kpi_targets: { weekly_views: 600000, eng_rate: 0.05 },
  },
  {
    name: "Syailendra",
    slug: "syailendra",
    platform: "tiktok",
    emotional_pillars: ["Fear/Anxiety", "Calm", "Conviction"],
    content_formats: ["slideshow"],
    cta_rules: "Implicit hardsell to Syailendra. Don't mention competitor funds.",
    kpi_targets: { weekly_views: 500000, eng_rate: 0.05 },
  },
];

// ------------------------------------------------------------
// 3. SEED DATA — PERSONAS  (1-2 per brand, keyed by brand slug)
// ------------------------------------------------------------
interface PersonaSeed {
  name: string;
  platform_username?: string;
  archetype?: string;
  tone_of_voice?: string;
  background?: string;
  language?: string;
}

const PERSONAS: Record<string, PersonaSeed[]> = {
  acekid: [
    {
      name: "Elle Ellit",
      platform_username: "elle.ellit",
      archetype: "Nutrition-conscious mom",
      tone_of_voice: "Warm, protective, evidence-driven",
      background:
        "Working mother of two who obsessively reads ingredient labels and shares parenting research.",
      language: "id",
    },
    {
      name: "Dr. Nayla",
      platform_username: "drnayla.kids",
      archetype: "Friendly pediatric educator",
      tone_of_voice: "Calm, authoritative, reassuring",
      background:
        "Pediatric nutrition educator who explains child health science in simple terms.",
      language: "id",
    },
  ],
  ugreen: [
    {
      name: "Lyra Nala",
      platform_username: "lyra.techlife",
      archetype: "Tech lifestyle creator",
      tone_of_voice: "Upbeat, curious, practical",
      background:
        "Remote-working content creator who lives out of a backpack and solves daily tech friction.",
      language: "id",
    },
    {
      name: "Reza Pratama",
      platform_username: "reza.setup",
      archetype: "Desk-setup gearhead",
      tone_of_voice: "Geeky, hands-on, detail-loving",
      background:
        "WFH professional obsessed with cable management and the perfect home-office setup.",
      language: "id",
    },
  ],
  "golden-rama": [
    {
      name: "Aria Vance",
      platform_username: "aria.vance",
      archetype: "Refined travel storyteller",
      tone_of_voice: "Editorial, declarative, aspirational",
      background:
        "Anonymous luxury-travel essayist who narrates destinations in crisp English statements.",
      language: "en",
    },
  ],
  bareksa: [
    {
      name: "Bima Saputra",
      platform_username: "bima.invest",
      archetype: "Anxious-then-empowered young investor",
      tone_of_voice: "Relatable, urgent, hopeful",
      background:
        "Mid-twenties office worker learning to invest after a financial scare.",
      language: "id",
    },
  ],
  syailendra: [
    {
      name: "Sasha Wirawan",
      platform_username: "sasha.calminvest",
      archetype: "Calm long-term wealth planner",
      tone_of_voice: "Composed, convicted, steady",
      background:
        "Financial planner who reframes market fear into disciplined long-term conviction.",
      language: "id",
    },
  ],
};

// ------------------------------------------------------------
// 4. SEED DATA — ACCOUNTS  (6 per brand, varied warmup phases)
// ------------------------------------------------------------
type AccountPhase = "cold" | "warming" | "warm" | "active";

// 6-slot phase rotation so every brand has a mix of cold/warming/warm/active.
const PHASE_ROTATION: AccountPhase[] = [
  "cold",
  "warming",
  "warm",
  "active",
  "warming",
  "warm",
];

// Username stem per brand -> usernames like `acekid_01`...`acekid_06`.
const ACCOUNT_STEM: Record<string, string> = {
  acekid: "acekid",
  ugreen: "ugreen",
  "golden-rama": "goldenrama",
  bareksa: "bareksa",
  syailendra: "syailendra",
};

// Persona round-robin per brand (indexes into PERSONAS[slug]).
const ACCOUNT_PERSONA_INDEX: Record<string, number[]> = {
  acekid: [0, 1],
  ugreen: [0, 1],
  "golden-rama": [0],
  bareksa: [0],
  syailendra: [0],
};

// ------------------------------------------------------------
// 5. SEED DATA — HOOKS  (a handful per brand, mapped to its pillars)
// ------------------------------------------------------------
interface HookSeed {
  hook_text: string;
  emotional_pillar: string;
  hook_type: string;
  language: string;
  performance_score: number;
}

const HOOKS: Record<string, HookSeed[]> = {
  acekid: [
    { hook_text: "Coba balik kemasan susu anakmu — cek bahan ke-2 dari atas.", emotional_pillar: "Fear", hook_type: "challenge", language: "id", performance_score: 0.82 },
    { hook_text: "Aku baru tahu maltodextrin punya indeks glikemik lebih tinggi dari gula.", emotional_pillar: "Fear", hook_type: "revelation", language: "id", performance_score: 0.76 },
    { hook_text: "Sebagai ibu, aku ngerti capeknya milih susu yang bener-bener aman.", emotional_pillar: "Empathy", hook_type: "relatable", language: "id", performance_score: 0.68 },
    { hook_text: "Bukan nakut-nakutin — ini cuma yang aku harap orang kasih tau lebih awal.", emotional_pillar: "Empathy", hook_type: "confession", language: "id", performance_score: 0.71 },
    { hook_text: "Di China, bahan ini dilarang untuk formula bayi 0-6 bulan. Cek faktanya.", emotional_pillar: "Trust", hook_type: "authority", language: "id", performance_score: 0.79 },
  ],
  ugreen: [
    { hook_text: "POV: cuma bawa 1 charger buat laptop, HP, sama earbuds.", emotional_pillar: "Problem Solution", hook_type: "pov", language: "id", performance_score: 0.74 },
    { hook_text: "Stop beli charger satu-satu. Ini kenapa GaN ganti semuanya.", emotional_pillar: "Problem Solution", hook_type: "myth-bust", language: "id", performance_score: 0.69 },
    { hook_text: "Tebak berapa device yang bisa dicharge sekaligus dari 1 colokan?", emotional_pillar: "Edukasi Interaktif", hook_type: "quiz", language: "id", performance_score: 0.66 },
    { hook_text: "Meja kerja yang rapi itu bukan estetik doang — ini setup-nya.", emotional_pillar: "Lifestyle", hook_type: "aspirational", language: "id", performance_score: 0.7 },
  ],
  "golden-rama": [
    { hook_text: "Some destinations are not seen. They are remembered.", emotional_pillar: "Inspired", hook_type: "aspirational", language: "en", performance_score: 0.73 },
    { hook_text: "The most expensive thing you can lose is an unrepeatable morning.", emotional_pillar: "Happy", hook_type: "statement", language: "en", performance_score: 0.67 },
    { hook_text: "Nobody talks about this island. That is precisely the point.", emotional_pillar: "Curious", hook_type: "intrigue", language: "en", performance_score: 0.71 },
  ],
  bareksa: [
    { hook_text: "Gaji habis tiap akhir bulan dan kamu masih ngerasa aman?", emotional_pillar: "Fear/Anxiety", hook_type: "wake-up", language: "id", performance_score: 0.77 },
    { hook_text: "Reksa dana itu ribet? Ini cara mulai dari Rp10.000.", emotional_pillar: "Curious", hook_type: "myth-bust", language: "id", performance_score: 0.7 },
    { hook_text: "Bayangin 5 tahun lagi kamu udah punya dana darurat tanpa kerasa.", emotional_pillar: "Hope", hook_type: "future-pacing", language: "id", performance_score: 0.72 },
  ],
  syailendra: [
    { hook_text: "Market lagi merah dan kamu panik? Ini yang investor sabar lakuin.", emotional_pillar: "Fear/Anxiety", hook_type: "reframe", language: "id", performance_score: 0.74 },
    { hook_text: "Berhenti cek portofolio tiap jam. Ini kenapa.", emotional_pillar: "Calm", hook_type: "advice", language: "id", performance_score: 0.68 },
    { hook_text: "Kekayaan jangka panjang dibangun dari keputusan yang membosankan.", emotional_pillar: "Conviction", hook_type: "statement", language: "id", performance_score: 0.71 },
  ],
};

// ------------------------------------------------------------
// 6. SEED DATA — TRENDS  (a few global + per-brand)
// ------------------------------------------------------------
interface TrendSeed {
  brandSlug: string | null; // null => global trend (brand_id null)
  platform: string;
  content_category: string;
  emotional_angle: string;
  hook_pattern: string;
  format_type: string;
  replication_difficulty: string;
  relevance_score: number;
  views: number;
  likes: number;
  shares: number;
}

const TRENDS: TrendSeed[] = [
  {
    brandSlug: null,
    platform: "tiktok",
    content_category: "POV",
    emotional_angle: "Relatable",
    hook_pattern: "POV: you finally...",
    format_type: "video",
    replication_difficulty: "low",
    relevance_score: 0.82,
    views: 4200000,
    likes: 510000,
    shares: 38000,
  },
  {
    brandSlug: null,
    platform: "instagram",
    content_category: "Aesthetic carousel",
    emotional_angle: "Inspired",
    hook_pattern: "Swipe to see the transformation",
    format_type: "slideshow",
    replication_difficulty: "medium",
    relevance_score: 0.74,
    views: 1800000,
    likes: 240000,
    shares: 12000,
  },
  {
    brandSlug: "acekid",
    platform: "tiktok",
    content_category: "Ingredient check",
    emotional_angle: "Fear",
    hook_pattern: "Check the back of the label",
    format_type: "video",
    replication_difficulty: "low",
    relevance_score: 0.88,
    views: 920000,
    likes: 134000,
    shares: 21000,
  },
  {
    brandSlug: "ugreen",
    platform: "tiktok",
    content_category: "Tech declutter",
    emotional_angle: "Problem Solution",
    hook_pattern: "One charger to replace them all",
    format_type: "video",
    replication_difficulty: "medium",
    relevance_score: 0.81,
    views: 1300000,
    likes: 167000,
    shares: 29000,
  },
  {
    brandSlug: "bareksa",
    platform: "tiktok",
    content_category: "Finance literacy",
    emotional_angle: "Fear/Anxiety",
    hook_pattern: "Your salary disappears because...",
    format_type: "slideshow",
    replication_difficulty: "low",
    relevance_score: 0.79,
    views: 760000,
    likes: 98000,
    shares: 18000,
  },
];

// ------------------------------------------------------------
// 7. UPSERT BRANDS
// ------------------------------------------------------------
async function seedBrands(db: SupabaseClient): Promise<Map<string, string>> {
  console.log("\n[seed] Upserting brands (onConflict: slug)...");
  const rows = BRANDS.map((b) => ({
    name: b.name,
    slug: b.slug,
    platform: b.platform,
    campaign_tagline: b.campaign_tagline ?? null,
    emotional_pillars: b.emotional_pillars,
    content_formats: b.content_formats,
    posting_sweet_spot: b.posting_sweet_spot ?? null,
    guidelines: b.guidelines ?? null,
    guardrails: b.guardrails ?? [],
    approved_claims: b.approved_claims ?? [],
    script_format: b.script_format ?? null,
    cta_rules: b.cta_rules ?? null,
    products: b.products ?? [],
    hero_products: b.hero_products ?? [],
    kpi_targets: b.kpi_targets ?? { weekly_views: 500000, eng_rate: 0.05 },
    status: "active",
  }));

  const { data, error } = await db
    .from("brands")
    .upsert(rows, { onConflict: "slug" })
    .select("id, slug, name");

  if (error) fail("upsert brands", error);

  const bySlug = new Map<string, string>();
  for (const row of data ?? []) {
    bySlug.set(row.slug as string, row.id as string);
    console.log(`  ok brand ${row.name} (${row.slug}) -> ${row.id}`);
  }
  return bySlug;
}

// ------------------------------------------------------------
// 8. PERSONAS  (delete-for-brand then insert)
// ------------------------------------------------------------
async function seedPersonas(
  db: SupabaseClient,
  brandIds: Map<string, string>
): Promise<Map<string, string[]>> {
  console.log("\n[seed] Reseeding personas...");
  const personaIdsByBrand = new Map<string, string[]>();

  for (const [slug, brandId] of brandIds) {
    const seeds = PERSONAS[slug] ?? [];
    if (seeds.length === 0) continue;

    // Clear FK refs to personas before deleting them (accounts + pipeline are
    // reseeded later anyway). Avoids accounts_persona_id_fkey / pipeline FK
    // violations on a re-run against an already-seeded DB.
    await db.from("accounts").update({ persona_id: null }).eq("brand_id", brandId);
    await db.from("content_pipeline").update({ persona_id: null }).eq("brand_id", brandId);

    const { error: delErr } = await db
      .from("personas")
      .delete()
      .eq("brand_id", brandId);
    if (delErr) fail(`delete personas for ${slug}`, delErr);

    const rows = seeds.map((p) => ({
      brand_id: brandId,
      name: p.name,
      platform_username: p.platform_username ?? null,
      archetype: p.archetype ?? null,
      tone_of_voice: p.tone_of_voice ?? null,
      background: p.background ?? null,
      language: p.language ?? "id",
    }));

    const { data, error } = await db.from("personas").insert(rows).select("id");
    if (error) fail(`insert personas for ${slug}`, error);

    const ids = (data ?? []).map((r) => r.id as string);
    personaIdsByBrand.set(slug, ids);
    console.log(`  ok ${slug}: ${ids.length} persona(s)`);
  }

  return personaIdsByBrand;
}

// ------------------------------------------------------------
// 9. ACCOUNTS  (6 per brand, delete-for-brand then insert; varied phases)
// ------------------------------------------------------------
async function seedAccounts(
  db: SupabaseClient,
  brandIds: Map<string, string>,
  personaIdsByBrand: Map<string, string[]>
): Promise<Map<string, string[]>> {
  console.log("\n[seed] Reseeding accounts (6 per brand)...");
  const accountIdsByBrand = new Map<string, string[]>();

  for (const [slug, brandId] of brandIds) {
    const personaIds = personaIdsByBrand.get(slug) ?? [];
    const personaIdxPlan = ACCOUNT_PERSONA_INDEX[slug] ?? [0];
    const platform = BRANDS.find((b) => b.slug === slug)?.platform ?? "tiktok";
    const stem = ACCOUNT_STEM[slug] ?? slug;

    // Clear FK refs to accounts before deleting (pipeline reseeded later).
    await db.from("content_pipeline").update({ account_id: null }).eq("brand_id", brandId);

    const { error: delErr } = await db
      .from("accounts")
      .delete()
      .eq("brand_id", brandId);
    if (delErr) fail(`delete accounts for ${slug}`, delErr);

    const rows = Array.from({ length: ACCOUNTS_PER_BRAND }, (_, i) => {
      const phase = PHASE_ROTATION[i % PHASE_ROTATION.length];
      const limit = PHASE_POST_LIMITS[phase];
      const username = `${stem}_${String(i + 1).padStart(2, "0")}`;

      // phase-correlated metrics so the dashboard looks believable
      const followerBase =
        phase === "cold"
          ? 40
          : phase === "warming"
            ? 350
            : phase === "warm"
              ? 1400
              : 6200;
      const followerCount = followerBase + randInt(0, followerBase);
      const engagementRate = +(0.02 + Math.random() * 0.05).toFixed(4); // 0.02–0.07
      const avgViews = followerCount * randInt(3, 8);

      // flag accounts #2 and #4 with an engagement-drop anomaly
      const isFlagged = i === 1 || i === 3;
      const personaId =
        personaIds.length > 0
          ? personaIds[(personaIdxPlan[i % personaIdxPlan.length] ?? 0) % personaIds.length]
          : null;

      // stagger phase_changed_at into the past, deeper as the phase matures
      const phaseAgeDays =
        phase === "cold" ? 3 : phase === "warming" ? 12 : phase === "warm" ? 35 : 75;

      return {
        brand_id: brandId,
        persona_id: personaId,
        platform,
        username,
        account_url: `https://www.${platform}.com/@${username}`,
        warmup_phase: phase,
        warmup_started_at: daysAgo(phaseAgeDays + 5),
        phase_changed_at: daysAgo(phaseAgeDays + i), // staggered per account
        warmup_notes: null,
        daily_post_limit: limit,
        min_hours_between_posts: 24,
        follower_count: followerCount,
        following_count: randInt(50, 250),
        engagement_rate: engagementRate,
        avg_views_last_7d: avgViews,
        total_posts: Math.floor(phaseAgeDays / 2),
        last_post_engagement: +(engagementRate * (0.8 + Math.random() * 0.4)).toFixed(4),
        status: isFlagged ? "flagged" : "active",
        last_posted_at: daysAgo(Math.random() * 2),
        last_scraped_at: daysAgo(Math.random() * 0.5),
        anomaly_flags: isFlagged ? ["engagement_drop"] : [],
        anomaly_flagged_at: isFlagged ? daysAgo(0.3) : null,
      };
    });

    const { data, error } = await db.from("accounts").insert(rows).select("id");
    if (error) fail(`insert accounts for ${slug}`, error);

    const ids = (data ?? []).map((r) => r.id as string);
    accountIdsByBrand.set(slug, ids);
    console.log(`  ok ${slug}: ${ids.length} account(s) (2 flagged)`);
  }

  return accountIdsByBrand;
}

// ------------------------------------------------------------
// 10. HOOKS  (all 5 brands; delete-for-brand then insert)
// ------------------------------------------------------------
async function seedHooks(
  db: SupabaseClient,
  brandIds: Map<string, string>
): Promise<void> {
  console.log("\n[seed] Reseeding hooks (all brands)...");

  for (const [slug, brandId] of brandIds) {
    const seeds = HOOKS[slug];
    if (!seeds || seeds.length === 0) continue;

    const { error: delErr } = await db
      .from("hooks")
      .delete()
      .eq("brand_id", brandId);
    if (delErr) fail(`delete hooks for ${slug}`, delErr);

    const rows = seeds.map((h) => ({
      brand_id: brandId,
      hook_text: h.hook_text,
      emotional_pillar: h.emotional_pillar,
      hook_type: h.hook_type,
      language: h.language,
      performance_score: h.performance_score,
      usage_count: randInt(0, 8),
    }));

    const { data, error } = await db.from("hooks").insert(rows).select("id");
    if (error) fail(`insert hooks for ${slug}`, error);
    console.log(`  ok ${slug}: ${(data ?? []).length} hook(s)`);
  }
}

// ------------------------------------------------------------
// 11. KPI METRICS  (~14 days per account, all brands, batched insert)
// ------------------------------------------------------------
async function seedKpiMetrics(
  db: SupabaseClient,
  brandIds: Map<string, string>,
  accountIdsByBrand: Map<string, string[]>,
  accountPhase: Map<string, AccountPhase>,
  accountFollowers: Map<string, number>
): Promise<void> {
  console.log(`\n[seed] Reseeding KPI metrics (~${KPI_DAYS} days/account)...`);

  const allRows: Record<string, unknown>[] = [];
  const allAccountIds: string[] = [];

  for (const [slug, brandId] of brandIds) {
    const accIds = accountIdsByBrand.get(slug) ?? [];
    for (const accountId of accIds) {
      allAccountIds.push(accountId);
      const phase = accountPhase.get(accountId) ?? "warming";
      // work backwards from current follower count so the series ends near it
      const dailyGainMin = phase === "cold" ? 2 : phase === "warming" ? 8 : phase === "warm" ? 20 : 60;
      const dailyGainMax = dailyGainMin * 3;

      // Pre-compute per-day follower gains, then back-fill so the LAST day's
      // followers_end ≈ the account's current follower_count.
      const gains = Array.from({ length: KPI_DAYS }, () =>
        randInt(dailyGainMin, dailyGainMax)
      );
      const totalGain = gains.reduce((a, g) => a + g, 0);
      const endFollowers = accountFollowers.get(accountId) ?? 500;
      let followers = Math.max(0, endFollowers - totalGain);

      for (let d = 0; d < KPI_DAYS; d++) {
        const gained = gains[d];
        const start = followers;
        const end = followers + gained;
        followers = end;

        const posts = randInt(0, 3);
        const views = posts * randInt(1200, 8000);
        const likes = Math.floor(views * (0.04 + Math.random() * 0.04));
        const comments = Math.floor(likes * 0.06);
        const shares = Math.floor(likes * 0.1);
        const saves = Math.floor(likes * 0.08);
        const engagementRate =
          views > 0
            ? +((likes + comments + shares + saves) / views).toFixed(4)
            : 0;

        allRows.push({
          brand_id: brandId,
          account_id: accountId,
          date: dateAgo(KPI_DAYS - 1 - d), // oldest -> newest
          followers_start: start,
          followers_end: end,
          total_views: views,
          total_likes: likes,
          total_comments: comments,
          total_shares: shares,
          total_saves: saves,
          posts_published: posts,
          engagement_rate: engagementRate,
          avg_views_per_post: posts > 0 ? Math.floor(views / posts) : 0,
          warmup_phase: phase,
        });
      }
    }
  }

  // unique(account_id, date) — clear the whole window for these accounts first.
  const dates = Array.from({ length: KPI_DAYS }, (_, d) => dateAgo(d));
  if (allAccountIds.length > 0) {
    const { error: delErr } = await db
      .from("kpi_metrics")
      .delete()
      .in("account_id", allAccountIds)
      .in("date", dates);
    if (delErr) fail("delete kpi window", delErr);
  }

  // Batched insert to keep request payloads reasonable.
  let inserted = 0;
  for (let i = 0; i < allRows.length; i += KPI_BATCH_SIZE) {
    const batch = allRows.slice(i, i + KPI_BATCH_SIZE);
    const { data, error } = await db.from("kpi_metrics").insert(batch).select("id");
    if (error) fail(`insert kpi batch starting at ${i}`, error);
    inserted += (data ?? []).length;
  }
  console.log(
    `  ok ${inserted} kpi row(s) across ${allAccountIds.length} account(s)`
  );
}

// ------------------------------------------------------------
// 12. TRENDS  (delete-all then insert; global + per-brand)
// ------------------------------------------------------------
async function seedTrends(
  db: SupabaseClient,
  brandIds: Map<string, string>
): Promise<void> {
  console.log("\n[seed] Reseeding trends...");

  // Clear the rows this seeder owns: global trends + trends for our brands.
  const ourBrandIds = Array.from(brandIds.values());
  const { error: delGlobalErr } = await db
    .from("trends")
    .delete()
    .is("brand_id", null);
  if (delGlobalErr) fail("delete global trends", delGlobalErr);
  if (ourBrandIds.length > 0) {
    const { error: delBrandErr } = await db
      .from("trends")
      .delete()
      .in("brand_id", ourBrandIds);
    if (delBrandErr) fail("delete brand trends", delBrandErr);
  }

  const rows = TRENDS.map((t) => {
    const engagementRate =
      t.views > 0 ? +((t.likes + t.shares) / t.views).toFixed(4) : 0;
    return {
      brand_id: t.brandSlug ? (brandIds.get(t.brandSlug) ?? null) : null,
      platform: t.platform,
      content_url: null,
      thumbnail_url: null,
      views: t.views,
      likes: t.likes,
      shares: t.shares,
      engagement_rate: engagementRate,
      content_category: t.content_category,
      emotional_angle: t.emotional_angle,
      hook_pattern: t.hook_pattern,
      format_type: t.format_type,
      replication_difficulty: t.replication_difficulty,
      relevance_score: t.relevance_score,
      status: "new",
    };
  });

  const { data, error } = await db.from("trends").insert(rows).select("id");
  if (error) fail("insert trends", error);
  console.log(`  ok ${(data ?? []).length} trend(s)`);
}

// ------------------------------------------------------------
// 13. CONTENT PIPELINE  (varied stages; AceKid + UGREEN + Bareksa)
// ------------------------------------------------------------
async function seedPipeline(
  db: SupabaseClient,
  brandIds: Map<string, string>,
  accountIdsByBrand: Map<string, string[]>,
  personaIdsByBrand: Map<string, string[]>
): Promise<void> {
  console.log("\n[seed] Reseeding content pipeline...");

  const PIPELINE_SLUGS = ["acekid", "ugreen", "bareksa"];

  const stagePlan = [
    { stage: "briefed", title: "Cek bahan ke-2 di kemasan susu anak", angle: "Fear", hook: "Coba balik kemasan susu anakmu sekarang.", pillar: "Fear", format: "video" },
    { stage: "scripted", title: "Cerita ibu yang baru sadar soal maltodextrin", angle: "Empathy", hook: "Bukan nakut-nakutin — ini yang aku harap diberi tahu lebih awal.", pillar: "Empathy", format: "video" },
    { stage: "qc_review", title: "Fakta regulasi vanillin di formula bayi", angle: "Trust", hook: "Di China bahan ini dilarang untuk bayi 0-6 bulan.", pillar: "Trust", format: "slideshow" },
    { stage: "posted", title: "1 charger buat semua device", angle: "Problem Solution", hook: "POV: cuma bawa 1 charger ke mana-mana.", pillar: "Problem Solution", format: "video" },
  ];

  for (const slug of PIPELINE_SLUGS) {
    const brandId = brandIds.get(slug);
    if (!brandId) continue;

    const { error: delErr } = await db
      .from("content_pipeline")
      .delete()
      .eq("brand_id", brandId);
    if (delErr) fail(`delete pipeline for ${slug}`, delErr);

    const accIds = accountIdsByBrand.get(slug) ?? [];
    const persIds = personaIdsByBrand.get(slug) ?? [];

    const rows = stagePlan.map((p, i) => {
      const isPosted = p.stage === "posted";
      const isQc = p.stage === "qc_review";
      return {
        brand_id: brandId,
        account_id: accIds.length ? accIds[i % accIds.length] : null,
        persona_id: persIds.length ? persIds[i % persIds.length] : null,
        stage: p.stage,
        content_type: "ugc",
        emotional_pillar: p.pillar,
        content_format: p.format,
        content_direction: { title: p.title, emotional_angle: p.angle, hook: p.hook },
        script:
          p.stage === "briefed"
            ? null
            : { text: `[${p.title}]\n\n${p.hook}\n\n...full script body...`, version: 1 },
        script_version: 1,
        qc_report: isQc
          ? {
              passed: false,
              score: 0.62,
              issues: ["Hook terlalu lambat di 3 detik pertama"],
              recommendations: ["Pindahkan klaim utama ke awal"],
            }
          : null,
        posted_at: isPosted ? daysAgo(1) : null,
        performance: isPosted
          ? { views: 18400, likes: 1320, comments: 96, shares: 210 }
          : null,
        performance_score: isPosted ? 0.78 : null,
        week_number: 26,
        priority: 5,
      };
    });

    const { data, error } = await db
      .from("content_pipeline")
      .insert(rows)
      .select("id");
    if (error) fail(`insert pipeline for ${slug}`, error);
    console.log(`  ok ${slug}: ${(data ?? []).length} pipeline row(s)`);
  }
}

// ------------------------------------------------------------
// 14. WORK OS — team_members, tasks, comments, dev_issues,
//     activity_log, notifications (migration 002) + integrations
//     (migration 003). Idempotent: delete-all-then-insert.
// ------------------------------------------------------------
interface TeamMemberSeed {
  key: string; // local handle for wiring relations
  name: string;
  role: string;
  email: string;
}

const TEAM_MEMBERS: TeamMemberSeed[] = [
  { key: "lead", name: "Haidar Rahman", role: "lead", email: "haidar@cakai.dev" },
  { key: "strat1", name: "Nadia Putri", role: "strategist", email: "nadia@cakai.dev" },
  { key: "strat2", name: "Ferry Gunawan", role: "strategist", email: "ferry@cakai.dev" },
  { key: "writer1", name: "Dina Maharani", role: "script_writer", email: "dina@cakai.dev" },
  { key: "writer2", name: "Yoga Pratama", role: "script_writer", email: "yoga@cakai.dev" },
  { key: "creator1", name: "Tari Anjani", role: "creator", email: "tari@cakai.dev" },
  { key: "hoc", name: "Bagus Wibowo", role: "head_of_creator", email: "bagus@cakai.dev" },
  { key: "monitor1", name: "Sinta Larasati", role: "account_monitor", email: "sinta@cakai.dev" },
  { key: "dev1", name: "Rizky Alfian", role: "developer", email: "rizky@cakai.dev" },
  { key: "dev2", name: "Maya Kusuma", role: "developer", email: "maya@cakai.dev" },
];

interface TaskSeed {
  title: string;
  type: string;
  status: string;
  priority: number;
  progress: number;
  brandSlug?: string | null;
  assignee?: string | null; // team member key
  createdBy?: string | null;
  dueInDays?: number | null; // negative = overdue (past)
  startedDaysAgo?: number | null;
  completedDaysAgo?: number | null;
  aiGenerated?: boolean;
  dependsOnIdx?: number[]; // indexes into TASKS (resolved to ids post-insert)
  labels?: string[];
  description?: string;
}

// 25 tasks across brands / types / statuses. A few overdue, AI-generated, dependent.
const TASKS: TaskSeed[] = [
  { title: "Riset trend parenting Q3 untuk AceKid", type: "strategy", status: "in_progress", priority: 2, progress: 45, brandSlug: "acekid", assignee: "strat1", createdBy: "lead", startedDaysAgo: 3, labels: ["research"] },
  { title: "Naskah: cek bahan ke-2 di kemasan susu", type: "script", status: "review", priority: 1, progress: 80, brandSlug: "acekid", assignee: "writer1", createdBy: "strat1", dueInDays: 2 },
  { title: "Revisi hook video maltodextrin", type: "script", status: "todo", priority: 2, progress: 0, brandSlug: "acekid", assignee: "writer2", createdBy: "hoc", dueInDays: -1 },
  { title: "Produksi video fakta vanillin", type: "production", status: "blocked", priority: 1, progress: 20, brandSlug: "acekid", assignee: "creator1", createdBy: "hoc", dueInDays: -3, dependsOnIdx: [1], labels: ["urgent"] },
  { title: "QC video AceKid batch minggu 26", type: "qc", status: "todo", priority: 3, progress: 0, brandSlug: "acekid", assignee: "hoc", createdBy: "lead", dueInDays: 4 },
  { title: "Pantau anomali engagement akun AceKid", type: "account", status: "in_progress", priority: 2, progress: 60, brandSlug: "acekid", assignee: "monitor1", createdBy: "lead", startedDaysAgo: 1 },

  { title: "Strategi konten UGREEN GaN charger", type: "strategy", status: "done", priority: 2, progress: 100, brandSlug: "ugreen", assignee: "strat2", createdBy: "lead", completedDaysAgo: 2 },
  { title: "Naskah POV 1 charger semua device", type: "script", status: "done", priority: 2, progress: 100, brandSlug: "ugreen", assignee: "writer1", createdBy: "strat2", completedDaysAgo: 1 },
  { title: "Produksi slideshow desk setup UGREEN", type: "production", status: "in_progress", priority: 3, progress: 50, brandSlug: "ugreen", assignee: "creator1", createdBy: "hoc", startedDaysAgo: 2 },
  { title: "Jadwalkan posting UGREEN Sabtu 23:00", type: "account", status: "todo", priority: 3, progress: 0, brandSlug: "ugreen", assignee: "monitor1", createdBy: "lead", dueInDays: 1 },
  { title: "Ide carousel NASync DXP4800", type: "content", status: "backlog", priority: 4, progress: 0, brandSlug: "ugreen", assignee: "strat2", createdBy: "strat2" },

  { title: "Riset destinasi luxury Golden Rama", type: "strategy", status: "in_progress", priority: 3, progress: 35, brandSlug: "golden-rama", assignee: "strat1", createdBy: "lead", startedDaysAgo: 4 },
  { title: "Naskah editorial English-only", type: "script", status: "review", priority: 2, progress: 75, brandSlug: "golden-rama", assignee: "writer2", createdBy: "strat1", dueInDays: 3 },
  { title: "QC pastikan no-logo guardrail Golden Rama", type: "qc", status: "blocked", priority: 1, progress: 10, brandSlug: "golden-rama", assignee: "hoc", createdBy: "lead", dueInDays: -2, labels: ["guardrail"] },

  { title: "Strategi hardsell CTA Bareksa", type: "strategy", status: "done", priority: 2, progress: 100, brandSlug: "bareksa", assignee: "strat2", createdBy: "lead", completedDaysAgo: 5 },
  { title: "Naskah literasi reksa dana Rp10.000", type: "script", status: "in_progress", priority: 2, progress: 55, brandSlug: "bareksa", assignee: "writer1", createdBy: "strat2", startedDaysAgo: 2 },
  { title: "Produksi slideshow dana darurat", type: "production", status: "todo", priority: 3, progress: 0, brandSlug: "bareksa", assignee: "creator1", createdBy: "hoc", dueInDays: 5 },

  { title: "Naskah reframe market merah Syailendra", type: "script", status: "todo", priority: 2, progress: 0, brandSlug: "syailendra", assignee: "writer2", createdBy: "strat1", dueInDays: 2 },
  { title: "QC tone calm & conviction Syailendra", type: "qc", status: "backlog", priority: 3, progress: 0, brandSlug: "syailendra", assignee: "hoc", createdBy: "lead" },

  { title: "Perbaiki bug dashboard KPI tidak update", type: "dev", status: "in_progress", priority: 1, progress: 40, brandSlug: null, assignee: "dev1", createdBy: "lead", startedDaysAgo: 1, dueInDays: -1, labels: ["bug"] },
  { title: "Tambah filter brand di activity feed", type: "dev", status: "todo", priority: 3, progress: 0, brandSlug: null, assignee: "dev2", createdBy: "lead", dueInDays: 6 },
  { title: "Setup cron retry gagal generate", type: "dev", status: "review", priority: 2, progress: 90, brandSlug: null, assignee: "dev1", createdBy: "lead", dueInDays: 1 },

  // AI-generated breakdown of "Luncurkan kampanye AceKid minggu depan"
  { title: "AI: Susun kalender konten 7 hari AceKid", type: "strategy", status: "backlog", priority: 2, progress: 0, brandSlug: "acekid", createdBy: "lead", aiGenerated: true },
  { title: "AI: Siapkan 5 hook variasi Fear pillar", type: "content", status: "backlog", priority: 2, progress: 0, brandSlug: "acekid", createdBy: "lead", aiGenerated: true },
  { title: "AI: Brief produksi untuk creator", type: "production", status: "backlog", priority: 3, progress: 0, brandSlug: "acekid", createdBy: "lead", aiGenerated: true },
];

interface CommentSeed {
  taskIdx: number;
  author: string;
  body: string;
}

const TASK_COMMENTS: CommentSeed[] = [
  { taskIdx: 1, author: "hoc", body: "Hook-nya udah kuat, tapi pindahin klaim utama ke 3 detik pertama ya." },
  { taskIdx: 1, author: "writer1", body: "Noted, lagi revisi. Versi baru sore ini." },
  { taskIdx: 3, author: "creator1", body: "Ke-block nih, nunggu naskah final dari tim writer." },
  { taskIdx: 13, author: "lead", body: "Wajib double-check guardrail no-logo sebelum publish." },
  { taskIdx: 19, author: "dev1", body: "Root cause: query KPI ke-cache, lagi benerin invalidation." },
];

interface DevIssueSeed {
  title: string;
  description: string;
  severity: string;
  status: string;
  area: string;
  reportedBy: string;
  assignee?: string | null;
  taskIdx?: number | null;
  githubIssueNumber?: number | null;
  githubUrl?: string | null;
  githubState?: string | null;
}

const DEV_ISSUES: DevIssueSeed[] = [
  { title: "Dashboard KPI tidak update realtime", description: "Angka follower stuck di cache lama, harus hard refresh.", severity: "high", status: "in_progress", area: "frontend", reportedBy: "monitor1", assignee: "dev1", taskIdx: 19, githubIssueNumber: 142, githubUrl: "https://github.com/cakai/ecosystem/issues/142", githubState: "open" },
  { title: "Generate video kadang timeout di fal", description: "Job berhenti tanpa error message, perlu retry otomatis.", severity: "critical", status: "open", area: "backend", reportedBy: "hoc", assignee: "dev1" },
  { title: "Activity feed lambat saat data banyak", description: "Loading >3 detik tanpa pagination.", severity: "medium", status: "triaging", area: "backend", reportedBy: "lead", assignee: "dev2" },
  { title: "Tombol mark-all-read tidak berfungsi", description: "Klik tidak menghapus badge unread.", severity: "low", status: "open", area: "frontend", reportedBy: "strat1" },
  { title: "Agent strategy_suggest kadang balikin JSON rusak", description: "Parser gagal saat LLM nambahin teks di luar array.", severity: "high", status: "resolved", area: "agent", reportedBy: "writer2", assignee: "dev2", githubIssueNumber: 138, githubUrl: "https://github.com/cakai/ecosystem/issues/138", githubState: "closed" },
  { title: "Supabase egress quota mendekati limit", description: "Perlu pindah media ke R2 atau optimalkan query.", severity: "medium", status: "open", area: "infra", reportedBy: "lead", assignee: "dev1" },
];

interface IntegrationSeed {
  provider: string;
  display_name: string;
  status: string;
  account_label: string;
  connectedBy: string;
  config?: Record<string, unknown>;
  lastSyncedDaysAgo?: number | null;
}

const INTEGRATIONS: IntegrationSeed[] = [
  { provider: "tiktok", display_name: "TikTok Business", status: "connected", account_label: "@acekid_official", connectedBy: "monitor1", lastSyncedDaysAgo: 0.2 },
  { provider: "github", display_name: "GitHub", status: "connected", account_label: "cakai/ecosystem", connectedBy: "dev1", lastSyncedDaysAgo: 0.1 },
  { provider: "google_docs", display_name: "Google Docs", status: "connected", account_label: "cakai workspace", connectedBy: "lead", lastSyncedDaysAgo: 1 },
  { provider: "postiz", display_name: "Postiz Scheduler", status: "error", account_label: "main", connectedBy: "monitor1", lastSyncedDaysAgo: 2 },
];

interface EmbeddedSeed {
  provider: string;
  kind: string;
  title: string;
  external_url: string;
  external_id?: string;
  brandSlug?: string | null;
  taskIdx?: number | null;
  createdBy: string;
}

const EMBEDDED_RESOURCES: EmbeddedSeed[] = [
  { provider: "google_docs", kind: "doc", title: "AceKid Content Calendar Q3", external_url: "https://docs.google.com/document/d/acekid-cal", external_id: "acekid-cal", brandSlug: "acekid", taskIdx: 23, createdBy: "lead" },
  { provider: "google_sheets", kind: "sheet", title: "KPI Tracker — All Brands", external_url: "https://docs.google.com/spreadsheets/d/kpi-tracker", external_id: "kpi-tracker", brandSlug: null, taskIdx: 19, createdBy: "lead" },
  { provider: "google_docs", kind: "doc", title: "Naskah POV UGREEN Final", external_url: "https://docs.google.com/document/d/ugreen-pov", external_id: "ugreen-pov", brandSlug: "ugreen", taskIdx: 7, createdBy: "writer1" },
];

async function tableExists(db: SupabaseClient, table: string): Promise<boolean> {
  const { error } = await db.from(table).select("id").limit(1);
  // Missing table -> PostgREST returns a relation-does-not-exist error.
  return !(error && /does not exist|find the table|schema cache/i.test(error.message));
}

async function seedWorkOs(
  db: SupabaseClient,
  brandIds: Map<string, string>
): Promise<void> {
  console.log("\n[seed] Reseeding Work OS (team, tasks, dev issues, activity)...");

  // Order matters for FK cleanup: delete children before parents.
  for (const t of [
    "embedded_resources",
    "integration_connections",
    "notifications",
    "activity_log",
    "task_comments",
    "dev_issues",
    "tasks",
    "team_members",
  ]) {
    if (await tableExists(db, t)) {
      const { error } = await db.from(t).delete().not("id", "is", null);
      if (error) fail(`clear ${t}`, error);
    }
  }

  // --- team_members ---
  const memberRows = TEAM_MEMBERS.map((m) => ({
    name: m.name,
    role: m.role,
    email: m.email,
    status: "active",
  }));
  const { data: memberData, error: memberErr } = await db
    .from("team_members")
    .insert(memberRows)
    .select("id, email");
  if (memberErr) fail("insert team_members", memberErr);
  const memberIdByKey = new Map<string, string>();
  for (const m of TEAM_MEMBERS) {
    const row = (memberData ?? []).find((r) => r.email === m.email);
    if (row) memberIdByKey.set(m.key, row.id as string);
  }
  console.log(`  ok team_members: ${(memberData ?? []).length}`);

  const mid = (key?: string | null): string | null =>
    key ? (memberIdByKey.get(key) ?? null) : null;

  // --- tasks (two-pass: insert, then patch depends_on) ---
  const taskRows = TASKS.map((t) => ({
    brand_id: t.brandSlug ? (brandIds.get(t.brandSlug) ?? null) : null,
    title: t.title,
    description: t.description ?? null,
    type: t.type,
    status: t.status,
    priority: t.priority,
    progress: t.progress,
    assignee_id: mid(t.assignee),
    created_by: mid(t.createdBy),
    due_date: t.dueInDays != null ? daysAgo(-t.dueInDays) : null,
    started_at: t.startedDaysAgo != null ? daysAgo(t.startedDaysAgo) : null,
    completed_at: t.completedDaysAgo != null ? daysAgo(t.completedDaysAgo) : null,
    labels: t.labels ?? [],
    ai_generated: t.aiGenerated ?? false,
  }));
  const { data: taskData, error: taskErr } = await db
    .from("tasks")
    .insert(taskRows)
    .select("id");
  if (taskErr) fail("insert tasks", taskErr);
  const taskIds = (taskData ?? []).map((r) => r.id as string);
  console.log(`  ok tasks: ${taskIds.length}`);

  // Resolve depends_on indexes -> ids and patch the rows that have them.
  for (let i = 0; i < TASKS.length; i++) {
    const dep = TASKS[i].dependsOnIdx;
    if (!dep || dep.length === 0) continue;
    const depIds = dep.map((d) => taskIds[d]).filter(Boolean);
    if (depIds.length === 0) continue;
    const { error } = await db.from("tasks").update({ depends_on: depIds }).eq("id", taskIds[i]);
    if (error) fail(`patch depends_on for task ${i}`, error);
  }

  // --- task_comments ---
  const commentRows = TASK_COMMENTS.map((c) => ({
    task_id: taskIds[c.taskIdx],
    author_id: mid(c.author),
    body: c.body,
  })).filter((r) => r.task_id);
  const { data: commentData, error: commentErr } = await db
    .from("task_comments")
    .insert(commentRows)
    .select("id");
  if (commentErr) fail("insert task_comments", commentErr);
  console.log(`  ok task_comments: ${(commentData ?? []).length}`);

  // --- dev_issues ---
  const issueRows = DEV_ISSUES.map((d) => ({
    title: d.title,
    description: d.description,
    severity: d.severity,
    status: d.status,
    area: d.area,
    reported_by: mid(d.reportedBy),
    assignee_id: mid(d.assignee),
    task_id: d.taskIdx != null ? (taskIds[d.taskIdx] ?? null) : null,
    github_issue_number: d.githubIssueNumber ?? null,
    github_url: d.githubUrl ?? null,
    github_state: d.githubState ?? null,
  }));
  const { data: issueData, error: issueErr } = await db
    .from("dev_issues")
    .insert(issueRows)
    .select("id");
  if (issueErr) fail("insert dev_issues", issueErr);
  console.log(`  ok dev_issues: ${(issueData ?? []).length}`);

  // --- activity_log (~15 recent entries referencing the seeded rows) ---
  const acekidBrandId = brandIds.get("acekid") ?? null;
  const ugreenBrandId = brandIds.get("ugreen") ?? null;
  const activityRows = [
    { actor_id: mid("lead"), entity_type: "task", entity_id: taskIds[0], action: "created", summary: TASKS[0].title, brand_id: acekidBrandId, created_at: daysAgo(0.1) },
    { actor_id: mid("writer1"), entity_type: "task", entity_id: taskIds[1], action: "status_changed", summary: `in_progress → review: ${TASKS[1].title}`, brand_id: acekidBrandId, created_at: daysAgo(0.2) },
    { actor_id: mid("hoc"), entity_type: "task", entity_id: taskIds[1], action: "commented", summary: "Hook-nya udah kuat, tapi pindahin klaim utama...", brand_id: acekidBrandId, created_at: daysAgo(0.3) },
    { actor_id: mid("creator1"), entity_type: "task", entity_id: taskIds[3], action: "status_changed", summary: `todo → blocked: ${TASKS[3].title}`, brand_id: acekidBrandId, created_at: daysAgo(0.5) },
    { actor_id: mid("strat2"), entity_type: "task", entity_id: taskIds[6], action: "completed", summary: TASKS[6].title, brand_id: ugreenBrandId, created_at: daysAgo(2) },
    { actor_id: mid("writer1"), entity_type: "task", entity_id: taskIds[7], action: "completed", summary: TASKS[7].title, brand_id: ugreenBrandId, created_at: daysAgo(1) },
    { actor_id: mid("lead"), entity_type: "task", action: "created", summary: "AI broke down goal into 3 tasks: Luncurkan kampanye AceKid", brand_id: acekidBrandId, created_at: daysAgo(0.4) },
    { actor_id: mid("monitor1"), entity_type: "account", entity_id: null, action: "updated", summary: "Engagement drop terdeteksi di acekid_02", brand_id: acekidBrandId, created_at: daysAgo(0.6) },
    { actor_id: mid("hoc"), entity_type: "dev_issue", entity_id: issueData?.[1]?.id ?? null, action: "created", summary: DEV_ISSUES[1].title, brand_id: null, created_at: daysAgo(0.7) },
    { actor_id: mid("dev1"), entity_type: "dev_issue", entity_id: issueData?.[0]?.id ?? null, action: "status_changed", summary: `open → in_progress: ${DEV_ISSUES[0].title}`, brand_id: null, created_at: daysAgo(0.8) },
    { actor_id: mid("dev2"), entity_type: "dev_issue", entity_id: issueData?.[4]?.id ?? null, action: "status_changed", summary: `in_progress → resolved: ${DEV_ISSUES[4].title}`, brand_id: null, created_at: daysAgo(1.5) },
    { actor_id: mid("strat1"), entity_type: "task", entity_id: taskIds[11], action: "status_changed", summary: `todo → in_progress: ${TASKS[11].title}`, brand_id: brandIds.get("golden-rama") ?? null, created_at: daysAgo(3) },
    { actor_id: mid("hoc"), entity_type: "task", entity_id: taskIds[13], action: "status_changed", summary: `todo → blocked: ${TASKS[13].title}`, brand_id: brandIds.get("golden-rama") ?? null, created_at: daysAgo(2.2) },
    { actor_id: mid("writer1"), entity_type: "task", entity_id: taskIds[15], action: "commented", summary: "Lagi nulis bagian dana darurat", brand_id: brandIds.get("bareksa") ?? null, created_at: daysAgo(0.9) },
    { actor_id: mid("dev1"), entity_type: "task", entity_id: taskIds[19], action: "commented", summary: "Root cause: query KPI ke-cache", brand_id: null, created_at: daysAgo(0.15) },
  ];
  const { data: activityData, error: activityErr } = await db
    .from("activity_log")
    .insert(activityRows)
    .select("id");
  if (activityErr) fail("insert activity_log", activityErr);
  console.log(`  ok activity_log: ${(activityData ?? []).length}`);

  // --- notifications (lead + a few members) ---
  const notifRows = [
    { recipient_id: mid("lead"), type: "alert", title: "Critical dev issue reported", body: DEV_ISSUES[1].title, link: "/dev-issues", read: false, created_at: daysAgo(0.7) },
    { recipient_id: mid("lead"), type: "info", title: "2 tasks overdue", body: "Cek bottleneck di command center", link: "/", read: false, created_at: daysAgo(0.3) },
    { recipient_id: mid("writer1"), type: "assignment", title: "New task assigned", body: TASKS[1].title, link: `/tasks/${taskIds[1]}`, read: true, created_at: daysAgo(1) },
    { recipient_id: mid("creator1"), type: "assignment", title: "Task assigned to you", body: TASKS[3].title, link: `/tasks/${taskIds[3]}`, read: false, created_at: daysAgo(0.5) },
    { recipient_id: mid("dev1"), type: "alert", title: "Issue escalated to critical", body: DEV_ISSUES[1].title, link: "/dev-issues", read: false, created_at: daysAgo(0.6) },
    { recipient_id: mid("hoc"), type: "mention", title: "You were mentioned", body: "QC pastikan no-logo guardrail Golden Rama", link: `/tasks/${taskIds[13]}`, read: false, created_at: daysAgo(2.1) },
  ].filter((r) => r.recipient_id);
  const { data: notifData, error: notifErr } = await db
    .from("notifications")
    .insert(notifRows)
    .select("id");
  if (notifErr) fail("insert notifications", notifErr);
  console.log(`  ok notifications: ${(notifData ?? []).length}`);

  // --- integrations (migration 003, only if present) ---
  if (await tableExists(db, "integration_connections")) {
    const intRows = INTEGRATIONS.map((i) => ({
      provider: i.provider,
      display_name: i.display_name,
      status: i.status,
      account_label: i.account_label,
      config: i.config ?? {},
      last_synced_at: i.lastSyncedDaysAgo != null ? daysAgo(i.lastSyncedDaysAgo) : null,
      last_error: i.status === "error" ? "Auth token expired — reconnect required" : null,
      connected_by: mid(i.connectedBy),
    }));
    const { data: intData, error: intErr } = await db
      .from("integration_connections")
      .insert(intRows)
      .select("id");
    if (intErr) fail("insert integration_connections", intErr);
    console.log(`  ok integration_connections: ${(intData ?? []).length}`);
  }

  if (await tableExists(db, "embedded_resources")) {
    const embRows = EMBEDDED_RESOURCES.map((e) => ({
      provider: e.provider,
      kind: e.kind,
      title: e.title,
      external_url: e.external_url,
      external_id: e.external_id ?? null,
      brand_id: e.brandSlug ? (brandIds.get(e.brandSlug) ?? null) : null,
      task_id: e.taskIdx != null ? (taskIds[e.taskIdx] ?? null) : null,
      created_by: mid(e.createdBy),
    }));
    const { data: embData, error: embErr } = await db
      .from("embedded_resources")
      .insert(embRows)
      .select("id");
    if (embErr) fail("insert embedded_resources", embErr);
    console.log(`  ok embedded_resources: ${(embData ?? []).length}`);
  }
}

// ------------------------------------------------------------
// 15. MAIN
// ------------------------------------------------------------
async function main(): Promise<void> {
  const { url, serviceKey } = loadEnv();

  console.log("[seed] CAK AI Ecosystem — seeding database");
  console.log(`[seed] target: ${url}`);

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const brandIds = await seedBrands(db);
  const personaIdsByBrand = await seedPersonas(db, brandIds);
  const accountIdsByBrand = await seedAccounts(db, brandIds, personaIdsByBrand);

  // Pull phase + follower_count back so KPI series can be anchored to reality.
  const accountPhase = new Map<string, AccountPhase>();
  const accountFollowers = new Map<string, number>();
  {
    const { data, error } = await db
      .from("accounts")
      .select("id, warmup_phase, follower_count")
      .in("brand_id", Array.from(brandIds.values()));
    if (error) fail("read back accounts", error);
    for (const r of data ?? []) {
      accountPhase.set(r.id as string, (r.warmup_phase as AccountPhase) ?? "warming");
      accountFollowers.set(r.id as string, (r.follower_count as number) ?? 500);
    }
  }

  await seedHooks(db, brandIds);
  await seedTrends(db, brandIds);
  await seedKpiMetrics(db, brandIds, accountIdsByBrand, accountPhase, accountFollowers);
  await seedPipeline(db, brandIds, accountIdsByBrand, personaIdsByBrand);
  await seedWorkOs(db, brandIds);

  // Volume summary
  const brandCount = brandIds.size;
  const accountCount = Array.from(accountIdsByBrand.values()).reduce(
    (a, ids) => a + ids.length,
    0
  );
  console.log("\n[seed] Summary:");
  console.log(`  brands:   ${brandCount}`);
  console.log(`  accounts: ${accountCount} (${ACCOUNTS_PER_BRAND}/brand)`);
  console.log(`  kpi rows: ~${accountCount * KPI_DAYS} (${KPI_DAYS} days/account)`);
  console.log("\n[seed] Done. Database seeded successfully.");
  process.exit(0);
}

main().catch((err) => fail("unexpected error", err));
