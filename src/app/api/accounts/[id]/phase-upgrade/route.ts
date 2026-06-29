// ============================================================
// POST /api/accounts/[id]/phase-upgrade — manual phase override.
// Body: { phase }
// Updates warmup_phase, phase_changed_at, daily_post_limit (from PHASE_POST_LIMITS).
// ============================================================
import { admin, nowIso } from "@/lib/supabase";
import { ok, err } from "@/lib/api";
import { WARMUP_PHASES, PHASE_POST_LIMITS, type WarmupPhase } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PhaseUpgradeBody {
  phase?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return err("account id is required", 400);

    let body: PhaseUpgradeBody;
    try {
      body = (await req.json()) as PhaseUpgradeBody;
    } catch {
      return err("invalid JSON body", 400);
    }

    const phase = body.phase;
    if (!phase) return err("phase is required", 400);
    if (!WARMUP_PHASES.includes(phase as WarmupPhase)) {
      return err(`invalid phase; must be one of: ${WARMUP_PHASES.join(", ")}`, 400);
    }

    const typedPhase = phase as WarmupPhase;
    const { data, error } = await admin()
      .from("accounts")
      .update({
        warmup_phase: typedPhase,
        phase_changed_at: nowIso(),
        daily_post_limit: PHASE_POST_LIMITS[typedPhase],
        updated_at: nowIso(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return err(error.message, 500);
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to update phase", 500);
  }
}
