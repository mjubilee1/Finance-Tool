import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

export const TREND_THEMES = [
  "ai_models",
  "labs",
  "infra",
  "startup",
  "hardware_software",
  "markets",
  "real_estate",
  "dmv_state",
] as const;

export type TrendTheme = (typeof TREND_THEMES)[number];

export const TREND_ITEM_STATUSES = ["new", "noted", "parked", "dismissed"] as const;
export type TrendItemStatus = (typeof TREND_ITEM_STATUSES)[number];

/** Fixed allowlist — wide radar in, tight digest out. */
export const TREND_SOURCE_ALLOWLIST = [
  // AI / tech
  { label: "OpenAI", url: "https://openai.com/news/" },
  { label: "Anthropic", url: "https://www.anthropic.com/news" },
  { label: "Google DeepMind", url: "https://deepmind.google/discover/blog/" },
  { label: "Meta AI", url: "https://ai.meta.com/blog/" },
  { label: "NVIDIA Blog", url: "https://blogs.nvidia.com/" },
  { label: "Microsoft Azure AI", url: "https://azure.microsoft.com/en-us/blog/product/ai/" },
  { label: "AWS Machine Learning", url: "https://aws.amazon.com/blogs/machine-learning/" },
  { label: "Stanford HAI", url: "https://hai.stanford.edu/news" },
  { label: "Berkeley AI Research", url: "https://bair.berkeley.edu/blog/" },
  { label: "MIT CSAIL", url: "https://www.csail.mit.edu/news" },
  { label: "Hugging Face", url: "https://huggingface.co/blog" },
  { label: "a16z", url: "https://a16z.com/" },
  // Markets / property
  { label: "BlackRock Real Assets", url: "https://www.blackrock.com/institutions/en-us/insights/real-assets" },
  { label: "BlackRock Insights", url: "https://www.blackrock.com/us/individual/insights" },
  { label: "CBRE Research", url: "https://www.cbre.com/insights" },
  { label: "JLL Research", url: "https://www.us.jll.com/en/trends-and-insights/research" },
  { label: "Federal Reserve", url: "https://www.federalreserve.gov/newsevents.htm" },
  { label: "Fannie Mae Research", url: "https://www.fanniemae.com/research-and-insights" },
  // DMV — Maryland / DC / Virginia
  { label: "Maryland Matters", url: "https://marylandmatters.org/" },
  { label: "The Baltimore Banner", url: "https://www.thebaltimorebanner.com/" },
  { label: "Maryland.gov News", url: "https://governor.maryland.gov/news/press/" },
  { label: "WAMU / DCist", url: "https://dcist.com/" },
  { label: "DC Policy Center", url: "https://www.dcpolicycenter.org/publications/" },
  { label: "Greater Greater Washington", url: "https://ggwash.org/" },
  { label: "Virginia Mercury", url: "https://virginiamercury.com/" },
  { label: "Northern Virginia Magazine", url: "https://northernvirginiamag.com/news/" },
  { label: "Washington Post Local", url: "https://www.washingtonpost.com/local/" },
] as const;

const DEFAULT_GUARDRAIL =
  "Trends inform — they do not spawn new side projects. Finish today's leverage / promotion path before chasing a headline.";

type GeneratedMainThing = {
  title: string;
  why: string;
  oneAction: string;
};

type GeneratedItem = {
  title: string;
  summary: string;
  whyItMatters: string;
  theme: TrendTheme;
  sourceLabel: string;
  sourceUrl: string | null;
  relevanceScore: number;
};

type TrendSourceSnapshot = {
  label: string;
  url: string;
  pageTitle: string | null;
  description: string | null;
  headings: string[];
};

function isTheme(value: unknown): value is TrendTheme {
  return typeof value === "string" && (TREND_THEMES as readonly string[]).includes(value);
}

function clampScore(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n * 10) / 10));
}

function cleanHtmlText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, pattern: RegExp) {
  return cleanHtmlText(pattern.exec(html)?.[1] ?? "");
}

function uniqueShortTexts(values: string[], limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clean = cleanHtmlText(value);
    if (clean.length < 12 || clean.length > 180) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= limit) break;
  }

  return result;
}

async function fetchTrendSourceSnapshot(source: { label: string; url: string }): Promise<TrendSourceSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LifeOS-Trends/1.0; personal digest",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const html = (await response.text()).slice(0, 250_000);
    const headingMatches = Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)).map((match) => match[1]);
    const linkMatches = Array.from(html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)).map((match) => match[1]);

    return {
      label: source.label,
      url: source.url,
      pageTitle: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || null,
      description:
        firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
        firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
        null,
      headings: uniqueShortTexts([...headingMatches, ...linkMatches], 8),
    };
  } catch {
    return {
      label: source.label,
      url: source.url,
      pageTitle: null,
      description: null,
      headings: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTrendSourceSnapshots() {
  const snapshots = await Promise.all(
    TREND_SOURCE_ALLOWLIST.map((source) => fetchTrendSourceSnapshot(source)),
  );

  return snapshots.filter(
    (snapshot) => snapshot.pageTitle || snapshot.description || snapshot.headings.length > 0,
  );
}

function parseGeneratedDigest(raw: unknown): {
  mainThing: GeneratedMainThing;
  focusGuardrail: string;
  items: GeneratedItem[];
} {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const main =
    data.mainThing && typeof data.mainThing === "object"
      ? (data.mainThing as Record<string, unknown>)
      : {};

  const mainThing: GeneratedMainThing = {
    title:
      typeof main.title === "string" && main.title.trim()
        ? main.title.trim().slice(0, 160)
        : "Stay current without starting something new",
    why:
      typeof main.why === "string" && main.why.trim()
        ? main.why.trim().slice(0, 400)
        : "Signal beats noise when you protect one focus.",
    oneAction:
      typeof main.oneAction === "string" && main.oneAction.trim()
        ? main.oneAction.trim().slice(0, 200)
        : "Read one item, note the implication, return to your open leverage block.",
  };

  const focusGuardrail =
    typeof data.focusGuardrail === "string" && data.focusGuardrail.trim()
      ? data.focusGuardrail.trim().slice(0, 400)
      : DEFAULT_GUARDRAIL;

  const allowlistLabels = new Set(
    TREND_SOURCE_ALLOWLIST.map((source) => source.label.toLowerCase()),
  );
  const allowlistByLabel = new Map(
    TREND_SOURCE_ALLOWLIST.map((source) => [source.label.toLowerCase(), source]),
  );

  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const items: GeneratedItem[] = [];

  for (const entry of itemsRaw.slice(0, 5)) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.title !== "string" || !item.title.trim()) continue;
    if (typeof item.summary !== "string" || !item.summary.trim()) continue;
    if (typeof item.whyItMatters !== "string" || !item.whyItMatters.trim()) continue;

    const sourceLabelRaw =
      typeof item.sourceLabel === "string" && item.sourceLabel.trim()
        ? item.sourceLabel.trim()
        : "OpenAI";
    const sourceLabelLower = sourceLabelRaw.toLowerCase();
    const matched =
      allowlistByLabel.get(sourceLabelLower) ??
      TREND_SOURCE_ALLOWLIST.find((source) => {
        const allowedLabel = source.label.toLowerCase();
        return sourceLabelLower.includes(allowedLabel) || allowedLabel.includes(sourceLabelLower);
      });
    const sourceLabel = matched?.label ?? (
      [...allowlistLabels].some((label) => sourceLabelLower.includes(label) || label.includes(sourceLabelLower))
        ? sourceLabelRaw.slice(0, 80)
        : "OpenAI"
    );
    const fallbackSource = allowlistByLabel.get(sourceLabel.toLowerCase()) ?? TREND_SOURCE_ALLOWLIST[0];
    const sourceUrl =
      typeof item.sourceUrl === "string" && item.sourceUrl.trim().startsWith("http")
        ? item.sourceUrl.trim().slice(0, 500)
        : fallbackSource.url;

    items.push({
      title: item.title.trim().slice(0, 160),
      summary: item.summary.trim().slice(0, 500),
      whyItMatters: item.whyItMatters.trim().slice(0, 400),
      theme: isTheme(item.theme) ? item.theme : "ai_models",
      sourceLabel,
      sourceUrl,
      relevanceScore: clampScore(item.relevanceScore),
    });
  }

  if (items.length === 0) {
    items.push({
      title: "Model + infra stack keeps compounding",
      summary:
        "Frontier labs and chip/cloud vendors keep tightening the loop between models, training clusters, and developer platforms. Durable skill: understand the stack, not every launch.",
      whyItMatters:
        "As a builder/entrepreneur, knowing how models + hardware + platforms connect beats chasing every demo.",
      theme: "hardware_software",
      sourceLabel: "NVIDIA Blog",
      sourceUrl: "https://blogs.nvidia.com/",
      relevanceScore: 7,
    });
  }

  return { mainThing, focusGuardrail, items };
}

async function gatherTrendsContext(userId: string) {
  const [profile, goals, activities, openMoves, sourceSnapshots] = await Promise.all([
    prisma.lifeLeverageProfile.findUnique({ where: { userId } }),
    prisma.financialGoal.findMany({
      where: { userId, status: "active" },
      take: 12,
      select: { name: true, category: true, targetDate: true, priority: true },
    }),
    prisma.growthActivity.findMany({
      where: { userId, domain: { in: ["career", "startup"] } },
      orderBy: { date: "desc" },
      take: 15,
      select: { date: true, domain: true, title: true, category: true },
    }),
    prisma.growthRecommendation.findMany({
      where: { userId, status: "pending" },
      orderBy: { date: "desc" },
      take: 3,
      select: { date: true, action: true, domain: true },
    }),
    fetchTrendSourceSnapshots(),
  ]);

  return {
    homeBase:
      "Oxon Hill, Prince George's County, Maryland — DMV (DC / Maryland / Virginia). Local life: National Harbor, PG County, easy DC hops.",
    profile: profile
      ? {
          promotionTarget: profile.promotionTarget,
          promotionDeadline: profile.promotionDeadline,
          notes: profile.notes,
        }
      : null,
    goals,
    recentCareerStartupActivities: activities,
    openDailyMoves: openMoves,
    sources: TREND_SOURCE_ALLOWLIST,
    sourceSnapshots,
    knownPattern:
      "User tends to start things and not finish (manager feedback). Digest must reinforce finish-current-work, not spawn new builds.",
  };
}

export async function getTrendDigestForDate(userId: string, date: string) {
  return prisma.trendDigest.findUnique({
    where: { userId_date: { userId, date } },
    include: { items: { orderBy: { relevanceScore: "desc" } } },
  });
}

export async function generateTrendDigest(
  userId: string,
  options?: { force?: boolean },
) {
  const today = DateTime.local().toISODate()!;
  const existing = await getTrendDigestForDate(userId, today);

  if (existing && !options?.force) {
    return { digest: existing, refreshed: false, alreadyFresh: true };
  }

  const context = await gatherTrendsContext(userId);
  let generated = parseGeneratedDigest(null);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You curate a FOCUSED daily digest for Trell — software developer, homeowner/real-estate investor, and aspiring entrepreneur living in the DMV (Oxon Hill / PG County, MD).
Keep the main thing the main thing. This is NOT a news firehose.

Themes allowed: ai_models, labs, infra, startup, hardware_software, markets, real_estate, dmv_state.

Balance the digest:
- Tech/AI signal (models, labs, infra, hardware×software) when it matters for a builder.
- DMV local signal EVERY day when possible: Maryland politics/policy, DC news, Virginia/Northern Virginia developments, transit, housing, taxes, jobs — theme "dmv_state".
- Prefer at least 1–2 of the ≤5 items from DMV sources (Maryland Matters, Baltimore Banner, WAMU/DCist, Virginia Mercury, Washington Post Local, GGWash, etc.) unless snapshots are empty.
- Money/property only when it clearly hits mortgage, rates, housing supply, or Trell's property path.

HARD RULES:
- Max 5 items.
- One mainThing only — can be tech OR DMV, whichever is highest leverage today; do not bury local life.
- Never invent fake breaking news. Prefer durable patterns; if unsure, say "directional / not confirmed headline".
- Never recommend starting a new side project or product from a trend.
- Prefer implications for finishing current promotion/build work, protecting cash, DMV life logistics, or real-estate readiness.
- Local/politics items must connect to Trell's DMV life (commute, housing, taxes, state/local policy, jobs) — not national horse-race noise.
- Use sourceSnapshots as best-effort live page context. If a page snapshot is empty, do not pretend you read it.
- Rank the one source Trell most needs to read highest by relevanceScore.
- sourceLabel must come from the provided allowlist labels when possible.
- Strings short and scannable.`,
        },
        {
          role: "user",
          content: `Build today's digest.

Return JSON exactly:
{
  "mainThing": {
    "title": "one short focus title",
    "why": "one sentence why it matters for Trell",
    "oneAction": "one concrete action that does NOT start a new project (read/note/apply to open work)"
  },
  "focusGuardrail": "one blunt sentence: finish open work; trends inform only",
  "items": [
    {
      "title": "...",
      "summary": "2 sentences max",
      "whyItMatters": "why for Trell as DMV builder/homeowner/entrepreneur",
      "theme": "dmv_state",
      "sourceLabel": "Maryland Matters",
      "sourceUrl": "https://...",
      "relevanceScore": 8
    }
  ]
}

Mix tech + DMV in the 5 items when snapshots allow. At least one dmv_state item if any DMV sourceSnapshot has headings/description.

CONTEXT:
${JSON.stringify(context)}`,
        },
      ],
      max_completion_tokens: 2500,
      reasoning_effort: "minimal",
      verbosity: "low",
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      generated = parseGeneratedDigest(JSON.parse(content));
    }
  } catch (error) {
    console.error("Trend digest AI failed; using fallback:", error);
  }

  if (existing) {
    await prisma.trendItem.deleteMany({ where: { digestId: existing.id } });
    const digest = await prisma.trendDigest.update({
      where: { id: existing.id },
      data: {
        mainTitle: generated.mainThing.title,
        mainWhy: generated.mainThing.why,
        mainAction: generated.mainThing.oneAction,
        focusGuardrail: generated.focusGuardrail,
        items: {
          create: generated.items.map((item) => ({
            title: item.title,
            summary: item.summary,
            whyItMatters: item.whyItMatters,
            theme: item.theme,
            sourceLabel: item.sourceLabel,
            sourceUrl: item.sourceUrl,
            relevanceScore: item.relevanceScore,
            status: "new",
          })),
        },
      },
      include: { items: { orderBy: { relevanceScore: "desc" } } },
    });
    return { digest, refreshed: true, alreadyFresh: false };
  }

  const digest = await prisma.trendDigest.create({
    data: {
      userId,
      date: today,
      mainTitle: generated.mainThing.title,
      mainWhy: generated.mainThing.why,
      mainAction: generated.mainThing.oneAction,
      focusGuardrail: generated.focusGuardrail,
      items: {
        create: generated.items.map((item) => ({
          title: item.title,
          summary: item.summary,
          whyItMatters: item.whyItMatters,
          theme: item.theme,
          sourceLabel: item.sourceLabel,
          sourceUrl: item.sourceUrl,
          relevanceScore: item.relevanceScore,
          status: "new",
        })),
      },
    },
    include: { items: { orderBy: { relevanceScore: "desc" } } },
  });

  return { digest, refreshed: true, alreadyFresh: false };
}

export function serializeTrendDigest(
  digest: NonNullable<Awaited<ReturnType<typeof getTrendDigestForDate>>>,
) {
  return {
    id: digest.id,
    date: digest.date,
    mainThing: {
      title: digest.mainTitle,
      why: digest.mainWhy,
      oneAction: digest.mainAction,
    },
    focusGuardrail: digest.focusGuardrail,
    updatedAt: digest.updatedAt.toISOString(),
    createdAt: digest.createdAt.toISOString(),
    items: digest.items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      whyItMatters: item.whyItMatters,
      theme: item.theme,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      relevanceScore: item.relevanceScore,
      status: item.status,
      loggedActivityId: item.loggedActivityId,
    })),
  };
}
