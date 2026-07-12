import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

export const TECH_TREND_THEMES = [
  "ai_models",
  "labs",
  "infra",
  "startup",
  "hardware_software",
] as const;

/** Housing / rates / markets — not tech. Shown on the DMV page with local life. */
export const MONEY_TREND_THEMES = ["markets", "real_estate"] as const;

export const DMV_TREND_THEMES = ["dmv_state"] as const;

export const TREND_THEMES = [
  ...TECH_TREND_THEMES,
  ...MONEY_TREND_THEMES,
  ...DMV_TREND_THEMES,
] as const;

export const MAX_TECH_TREND_ITEMS = 4;
export const MAX_DMV_TREND_ITEMS = 3;

export function isDmvTrendTheme(theme: string) {
  return (DMV_TREND_THEMES as readonly string[]).includes(theme);
}

export function isMoneyTrendTheme(theme: string) {
  return (MONEY_TREND_THEMES as readonly string[]).includes(theme);
}

export function isTechTrendTheme(theme: string) {
  return (TECH_TREND_THEMES as readonly string[]).includes(theme);
}

/** DMV page = local politics + housing/rates (not AI). */
export function isDmvPageTheme(theme: string) {
  return isDmvTrendTheme(theme) || isMoneyTrendTheme(theme);
}

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

function parseItemEntry(
  entry: unknown,
  allowlistLabels: Set<string>,
  allowlistByLabel: Map<string, (typeof TREND_SOURCE_ALLOWLIST)[number]>,
  defaultTheme: TrendTheme,
): GeneratedItem | null {
  if (!entry || typeof entry !== "object") return null;
  const item = entry as Record<string, unknown>;
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (typeof item.summary !== "string" || !item.summary.trim()) return null;
  if (typeof item.whyItMatters !== "string" || !item.whyItMatters.trim()) return null;

  const sourceLabelRaw =
    typeof item.sourceLabel === "string" && item.sourceLabel.trim()
      ? item.sourceLabel.trim()
      : defaultTheme === "dmv_state"
        ? "Maryland Matters"
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
      : defaultTheme === "dmv_state"
        ? "Maryland Matters"
        : "OpenAI"
  );
  const fallbackSource = allowlistByLabel.get(sourceLabel.toLowerCase()) ?? (
    defaultTheme === "dmv_state"
      ? TREND_SOURCE_ALLOWLIST.find((s) => s.label === "Maryland Matters") ?? TREND_SOURCE_ALLOWLIST[0]
      : TREND_SOURCE_ALLOWLIST[0]
  );
  const sourceUrl =
    typeof item.sourceUrl === "string" && item.sourceUrl.trim().startsWith("http")
      ? item.sourceUrl.trim().slice(0, 500)
      : fallbackSource.url;

  let theme: TrendTheme = isTheme(item.theme) ? item.theme : defaultTheme;
  if (defaultTheme === "dmv_state" && !isDmvPageTheme(theme)) {
    theme = "dmv_state";
  }

  return {
    title: item.title.trim().slice(0, 160),
    summary: item.summary.trim().slice(0, 500),
    whyItMatters: item.whyItMatters.trim().slice(0, 400),
    theme,
    sourceLabel,
    sourceUrl,
    relevanceScore: clampScore(item.relevanceScore),
  };
}

function parseMainThing(
  raw: unknown,
  fallback: GeneratedMainThing,
): GeneratedMainThing {
  if (!raw || typeof raw !== "object") return fallback;
  const main = raw as Record<string, unknown>;
  return {
    title:
      typeof main.title === "string" && main.title.trim()
        ? main.title.trim().slice(0, 160)
        : fallback.title,
    why:
      typeof main.why === "string" && main.why.trim()
        ? main.why.trim().slice(0, 400)
        : fallback.why,
    oneAction:
      typeof main.oneAction === "string" && main.oneAction.trim()
        ? main.oneAction.trim().slice(0, 200)
        : fallback.oneAction,
  };
}

function parseGeneratedDigest(raw: unknown): {
  mainThing: GeneratedMainThing;
  techMain: GeneratedMainThing;
  dmvMain: GeneratedMainThing;
  focusGuardrail: string;
  items: GeneratedItem[];
} {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const defaultMain: GeneratedMainThing = {
    title: "Stay current without starting something new",
    why: "Signal beats noise when you protect one focus.",
    oneAction: "Read one item, note the implication, return to your open leverage block.",
  };

  const techMain = parseMainThing(
    data.techMainThing ?? data.mainThing,
    {
      title: "Stay sharp on the stack — don't start a new build",
      why: "Tech signal should inform the work you already have open.",
      oneAction: "Skim the top tech item and apply one note to an existing task.",
    },
  );
  const dmvMain = parseMainThing(data.dmvMainThing, {
    title: "Know the DMV pulse — then get back to your day",
    why: "Local news should help commute, housing, and life logistics — not become a rabbit hole.",
    oneAction: "Skim the top DMV item; park anything that isn't actionable this week.",
  });
  const mainThing = parseMainThing(data.mainThing, techMain);

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

  const techRaw = Array.isArray(data.techItems)
    ? data.techItems
    : Array.isArray(data.items)
      ? data.items
      : [];
  const dmvRaw = Array.isArray(data.dmvItems) ? data.dmvItems : [];

  const techItems: GeneratedItem[] = [];
  for (const entry of techRaw) {
    if (techItems.length >= MAX_TECH_TREND_ITEMS) break;
    const parsed = parseItemEntry(entry, allowlistLabels, allowlistByLabel, "ai_models");
    if (!parsed || !isTechTrendTheme(parsed.theme)) continue;
    techItems.push(parsed);
  }

  const dmvItems: GeneratedItem[] = [];
  for (const entry of dmvRaw) {
    if (dmvItems.length >= MAX_DMV_TREND_ITEMS) break;
    const parsed = parseItemEntry(entry, allowlistLabels, allowlistByLabel, "dmv_state");
    if (!parsed || !isDmvPageTheme(parsed.theme)) continue;
    dmvItems.push(parsed);
  }

  // Money/housing items wrongly placed in techItems by the model → move to DMV page.
  if (Array.isArray(data.techItems)) {
    for (const entry of data.techItems) {
      if (dmvItems.length >= MAX_DMV_TREND_ITEMS) break;
      const parsed = parseItemEntry(entry, allowlistLabels, allowlistByLabel, "dmv_state");
      if (!parsed || !isMoneyTrendTheme(parsed.theme)) continue;
      if (dmvItems.some((item) => item.title.toLowerCase() === parsed.title.toLowerCase())) continue;
      dmvItems.push(parsed);
    }
  }

  if (dmvItems.length === 0 && Array.isArray(data.items) && !Array.isArray(data.techItems)) {
    for (const entry of data.items) {
      if (dmvItems.length >= MAX_DMV_TREND_ITEMS) break;
      const parsed = parseItemEntry(entry, allowlistLabels, allowlistByLabel, "dmv_state");
      if (!parsed || !isDmvPageTheme(parsed.theme)) continue;
      dmvItems.push(parsed);
    }
  }

  const items = [...techItems, ...dmvItems];

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

  return { mainThing: mainThing.title ? mainThing : defaultMain, techMain, dmvMain, focusGuardrail, items };
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
          content: `You curate a SPLIT daily digest for Trell — software developer + aspiring entrepreneur in Oxon Hill / DMV.
Two SEPARATE lanes (never blend):

1) TECH lane — AI models, labs, infra, startup, hardware×software ONLY
2) DMV lane — Maryland/DC/Virginia politics AND housing/rates/markets (real_estate, markets) that affect Trell's home path

HARD RULES:
- techItems: 3–4 items. Themes ONLY: ai_models | labs | infra | startup | hardware_software
- NEVER put real_estate, markets, Metro, WMATA, Maryland politics, or Fannie Mae into techItems or techMainThing.
- dmvItems: 1–3 items. Themes: dmv_state | real_estate | markets
- techMainThing = pure builder/AI focus. dmvMainThing = local or housing focus.
- Never invent fake breaking news. If unsure: "directional / not confirmed headline".
- Never recommend starting a new side project from a trend.
- Use sourceSnapshots; if empty, do not pretend you read that page.
- sourceLabel from allowlist when possible.
- Strings short and scannable.`,
        },
        {
          role: "user",
          content: `Build today's SPLIT digest (Tech page + DMV page).

Return JSON exactly:
{
  "techMainThing": {
    "title": "tech focus title",
    "why": "why for builder Trell",
    "oneAction": "one tech action that does NOT start a new project"
  },
  "dmvMainThing": {
    "title": "DMV focus title",
    "why": "why for Oxon Hill / DMV life",
    "oneAction": "one local skim/note action"
  },
  "focusGuardrail": "finish open work; news is context only",
  "techItems": [
    {
      "title": "...",
      "summary": "2 sentences max",
      "whyItMatters": "why for Trell as builder",
      "theme": "ai_models",
      "sourceLabel": "OpenAI",
      "sourceUrl": "https://...",
      "relevanceScore": 8
    }
  ],
  "dmvItems": [
    {
      "title": "...",
      "summary": "2 sentences max",
      "whyItMatters": "why for Trell's DMV life",
      "theme": "dmv_state",
      "sourceLabel": "Maryland Matters",
      "sourceUrl": "https://...",
      "relevanceScore": 7
    }
  ]
}

Fill techItems AND dmvItems. Housing/rates (Fannie, mortgage outlook) go in dmvItems with theme real_estate — NEVER techItems.
Metro/politics go in dmvItems. Model/lab/infra releases go in techItems only.

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

  const digestFields = {
    mainTitle: generated.techMain.title,
    mainWhy: generated.techMain.why,
    mainAction: generated.techMain.oneAction,
    focusGuardrail: generated.focusGuardrail,
    techMainTitle: generated.techMain.title,
    techMainWhy: generated.techMain.why,
    techMainAction: generated.techMain.oneAction,
    dmvMainTitle: generated.dmvMain.title,
    dmvMainWhy: generated.dmvMain.why,
    dmvMainAction: generated.dmvMain.oneAction,
  };

  if (existing) {
    await prisma.trendItem.deleteMany({ where: { digestId: existing.id } });
    const digest = await prisma.trendDigest.update({
      where: { id: existing.id },
      data: {
        ...digestFields,
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
      ...digestFields,
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
  const techMain = {
    title: digest.techMainTitle ?? digest.mainTitle,
    why: digest.techMainWhy ?? digest.mainWhy,
    oneAction: digest.techMainAction ?? digest.mainAction,
  };
  const dmvMain = {
    title: digest.dmvMainTitle ?? "DMV pulse",
    why: digest.dmvMainWhy ?? "Local signal for commute, housing, and life logistics.",
    oneAction: digest.dmvMainAction ?? "Skim the top local item, then get back to open work.",
  };

  return {
    id: digest.id,
    date: digest.date,
    mainThing: techMain,
    techMain,
    dmvMain,
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
