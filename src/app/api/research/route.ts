// ============================================================
// POST /api/research — realtime, topic-aware trend research.
//
// body { topic: string; platforms?: string[]; limit?: number; suggest?: boolean }
//
// Fans out to TikTok / Instagram / YouTube / SGE in parallel (see
// researchTopic), ranks viral content relevant to the topic, and — when
// `suggest` is true — additionally asks the strategy_suggest assistant to turn
// the top items into concrete content directions.
//
// This route can be SLOW: it does live scraping (several seconds). The
// orchestrator isolates each platform so partial failures still return data.
// ============================================================
import { ok, err } from "@/lib/api";
import { researchTopic, type Platform, type ResearchItem } from "@/lib/research";
import { aiAssist } from "@/lib/ai-assist";
import { fmtCompact } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TOPIC_LEN = 200;
const ALL_PLATFORMS: Platform[] = ["tiktok", "instagram", "youtube", "sge"];

interface Body {
  topic?: string;
  platforms?: string[];
  limit?: number;
  suggest?: boolean;
}

/** Keep only valid platform names from caller input. */
function coercePlatforms(input?: string[]): Platform[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const valid = input.filter((p): p is Platform =>
    ALL_PLATFORMS.includes(p as Platform),
  );
  return valid.length ? valid : undefined;
}

/** Compact, LLM-friendly summary of the top items for strategy_suggest. */
function summarizeForSuggest(items: ResearchItem[]): string {
  return items
    .slice(0, 10)
    .map((it, i) => {
      const metrics = [
        it.views != null ? `${fmtCompact(it.views)} views` : "",
        it.likes != null ? `${fmtCompact(it.likes)} likes` : "",
        it.engagementRate != null ? `${(it.engagementRate * 100).toFixed(1)}% eng` : "",
      ]
        .filter(Boolean)
        .join(", ");
      const title = it.title?.trim() || it.url;
      return `${i + 1}. [${it.platform}] ${title}${metrics ? ` — ${metrics}` : ""}`;
    })
    .join("\n");
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

    let suggestions: unknown | undefined;
    if (body.suggest && items.length > 0) {
      try {
        const result = await aiAssist({
          tool: "strategy_suggest",
          input: topic,
          context: `Topik: ${topic}\n\nKonten viral relevan (urut skor):\n${summarizeForSuggest(items)}`,
        });
        suggestions = result.data ?? result.text;
      } catch {
        // suggestions are optional — never fail the whole request for them
        suggestions = undefined;
      }
    }

    return ok({ topic, items, errors, ...(suggestions !== undefined ? { suggestions } : {}) });
  } catch (e) {
    return err(e instanceof Error ? e.message : "research failed", 500);
  }
}
