// ============================================================
// POST /api/scriptwriter/trends — realtime, topic-aware trend research for the
// Script Studio. Thin wrapper over the ecosystem's route-agnostic
// researchTopic() so scriptwriters can pull what's trending on
// TikTok / Instagram / YouTube / SGE and feed it into briefs/ideas.
//
// body { topic: string; platforms?: string[]; limit?: number }
//
// Live scraping — can take several seconds. Each platform is isolated so
// partial failures still return data (see researchTopic).
// ============================================================
import { ok, err } from "@/lib/api";
import { researchTopic, type Platform } from "@/lib/research";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TOPIC_LEN = 200;
const ALL_PLATFORMS: Platform[] = ["tiktok", "instagram", "youtube", "sge"];

interface Body {
  topic?: string;
  platforms?: string[];
  limit?: number;
}

/** Keep only valid platform names from caller input. */
function coercePlatforms(input?: string[]): Platform[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const valid = input.filter((p): p is Platform => ALL_PLATFORMS.includes(p as Platform));
  return valid.length ? valid : undefined;
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return err("invalid JSON body", 400);
    }

    const topic = (body.topic ?? "").trim();
    if (!topic) return err("topic is required", 400);
    if (topic.length > MAX_TOPIC_LEN) return err(`topic too long (max ${MAX_TOPIC_LEN})`, 400);

    const platforms = coercePlatforms(body.platforms);
    const limit =
      typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 48) : undefined;

    const { items, errors } = await researchTopic(topic, { platforms, limit });
    return ok({ topic, items, errors });
  } catch (e) {
    return err(e instanceof Error ? e.message : "research failed", 500);
  }
}
