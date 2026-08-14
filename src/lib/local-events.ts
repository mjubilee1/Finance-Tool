import "server-only";

import { DateTime } from "luxon";
import { openai } from "@/lib/openai";
import { dayShapeFor } from "@/lib/joy-ideas-shared";
import {
  MAX_LOCAL_EVENT_ITEMS,
  isLocalEventConfidence,
  isLocalEventDayFit,
  isLocalEventDistanceTier,
  isLocalEventRegion,
  isLocalEventTheme,
  type LocalEventConfidence,
  type LocalEventDayFit,
  type LocalEventDistanceTier,
  type LocalEventRegion,
  type LocalEventTheme,
} from "@/lib/local-events-shared";
import { prisma } from "@/lib/prisma";
import { USER_TIME_ZONE } from "@/lib/user-timezone";

export {
  LOCAL_EVENT_DAY_FITS,
  LOCAL_EVENT_DISTANCE_TIERS,
  LOCAL_EVENT_REGIONS,
  LOCAL_EVENT_STATUSES,
  LOCAL_EVENT_THEMES,
  MAX_LOCAL_EVENT_ITEMS,
  distanceLabel,
  isLocalEventStatus,
  regionLabel,
  themeLabel,
  type LocalEventStatus,
  type LocalEventTheme,
} from "@/lib/local-events-shared";

/** Fixed allowlist — Oxon Hill home base, then Balt / Richmond / VB stretch drives. */
export const LOCAL_EVENT_SOURCE_ALLOWLIST = [
  {
    label: "National Harbor Events",
    url: "https://nationalharbor.com/events/",
    region: "dmv" as LocalEventRegion,
    distanceTier: "nearby" as LocalEventDistanceTier,
  },
  {
    label: "Destination DC Events",
    url: "https://washington.org/what-to-do/events",
    region: "dmv" as LocalEventRegion,
    distanceTier: "nearby" as LocalEventDistanceTier,
  },
  {
    label: "Eventbrite DC Business",
    url: "https://www.eventbrite.com/d/dc--washington/business--events/",
    region: "dmv" as LocalEventRegion,
    distanceTier: "nearby" as LocalEventDistanceTier,
  },
  {
    label: "Eventbrite DC Networking",
    url: "https://www.eventbrite.com/d/dc--washington/networking--events/",
    region: "dmv" as LocalEventRegion,
    distanceTier: "nearby" as LocalEventDistanceTier,
  },
  {
    label: "Smithsonian Events",
    url: "https://www.si.edu/events",
    region: "dmv" as LocalEventRegion,
    distanceTier: "nearby" as LocalEventDistanceTier,
  },
  {
    label: "Visit Baltimore Events",
    url: "https://baltimore.org/events/",
    region: "baltimore" as LocalEventRegion,
    distanceTier: "regional" as LocalEventDistanceTier,
  },
  {
    label: "Eventbrite Baltimore",
    url: "https://www.eventbrite.com/d/md--baltimore/events/",
    region: "baltimore" as LocalEventRegion,
    distanceTier: "regional" as LocalEventDistanceTier,
  },
  {
    label: "Visit Richmond Events",
    url: "https://www.visitrichmondva.com/events/",
    region: "richmond" as LocalEventRegion,
    distanceTier: "stretch" as LocalEventDistanceTier,
  },
  {
    label: "Eventbrite Richmond",
    url: "https://www.eventbrite.com/d/va--richmond/events/",
    region: "richmond" as LocalEventRegion,
    distanceTier: "stretch" as LocalEventDistanceTier,
  },
  {
    label: "Visit Virginia Beach Events",
    url: "https://www.visitvirginiabeach.com/events/",
    region: "virginia_beach" as LocalEventRegion,
    distanceTier: "stretch" as LocalEventDistanceTier,
  },
  {
    label: "Eventbrite Virginia Beach",
    url: "https://www.eventbrite.com/d/va--virginia-beach/events/",
    region: "virginia_beach" as LocalEventRegion,
    distanceTier: "stretch" as LocalEventDistanceTier,
  },
] as const;

const DEFAULT_GUARDRAIL =
  "Pick one high-fit outing that compounds network, skill, body, or joy — do not fill the week with random drives. Stretch trips (Richmond / Virginia Beach) stay weekend-sized.";

type EventSourceSnapshot = {
  label: string;
  url: string;
  region: LocalEventRegion;
  distanceTier: LocalEventDistanceTier;
  pageTitle: string | null;
  description: string | null;
  headings: string[];
};

type GeneratedRadar = {
  title: string;
  why: string;
  oneAction: string;
};

type GeneratedEventItem = {
  title: string;
  summary: string;
  whyItMatters: string;
  theme: LocalEventTheme;
  region: LocalEventRegion;
  distanceTier: LocalEventDistanceTier;
  city: string | null;
  venue: string | null;
  startsOn: string | null;
  endsOn: string | null;
  dayFit: LocalEventDayFit;
  driveMinutes: number | null;
  sourceLabel: string;
  sourceUrl: string | null;
  relevanceScore: number;
  confidence: LocalEventConfidence;
};

function clampScore(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n * 10) / 10));
}

function cleanHtmlText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
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
    if (clean.length < 8 || clean.length > 200) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= limit) break;
  }

  return result;
}

function asOptionalDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function asOptionalString(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function asOptionalMinutes(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(300, Math.round(n));
}

async function fetchEventSourceSnapshot(
  source: (typeof LOCAL_EVENT_SOURCE_ALLOWLIST)[number]
): Promise<EventSourceSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LifeOS-Events/1.0; personal local events digest",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const html = (await response.text()).slice(0, 280_000);
    const headingMatches = Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)).map(
      (match) => match[1]
    );
    const linkMatches = Array.from(html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)).map(
      (match) => match[1]
    );

    return {
      label: source.label,
      url: source.url,
      region: source.region,
      distanceTier: source.distanceTier,
      pageTitle: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || null,
      description:
        firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
        firstMatch(
          html,
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i
        ) ||
        null,
      headings: uniqueShortTexts([...headingMatches, ...linkMatches], 12),
    };
  } catch {
    return {
      label: source.label,
      url: source.url,
      region: source.region,
      distanceTier: source.distanceTier,
      pageTitle: null,
      description: null,
      headings: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchEventSourceSnapshots() {
  const snapshots = await Promise.all(
    LOCAL_EVENT_SOURCE_ALLOWLIST.map((source) => fetchEventSourceSnapshot(source))
  );
  return snapshots.filter(
    (snapshot) => snapshot.pageTitle || snapshot.description || snapshot.headings.length > 0
  );
}

function fallbackDigest(dayShape: string): {
  radar: GeneratedRadar;
  focusGuardrail: string;
  items: GeneratedEventItem[];
} {
  const weekendBias = dayShape === "weekend";
  return {
    radar: {
      title: weekendBias
        ? "Protect one high-fit social / network outing"
        : "Scan nearby evening networking or skill events",
      why: weekendBias
        ? "Weekends can hold a longer DMV or Baltimore block without wrecking the office week."
        : "Office/WFH days only fit nearby evening or short flex outings — keep stretch trips for the weekend.",
      oneAction: weekendBias
        ? "Pick one nearby or regional event and put it on the calendar with travel buffer."
        : "Shortlist one nearby mixer or learning event for tonight/Thu evening — skip Richmond/VB midweek.",
    },
    focusGuardrail: DEFAULT_GUARDRAIL,
    items: [
      {
        title: "DC founder / builder mixer radar",
        summary:
          "Scan Eventbrite DC networking + business listings for a founder/builder meetup you can reach after work.",
        whyItMatters:
          "Puts you around people shipping — compounds network equity without inventing a new side project.",
        theme: "networking",
        region: "dmv",
        distanceTier: "nearby",
        city: "Washington, DC",
        venue: null,
        startsOn: null,
        endsOn: null,
        dayFit: "evening",
        driveMinutes: 35,
        sourceLabel: "Eventbrite DC Networking",
        sourceUrl: "https://www.eventbrite.com/d/dc--washington/networking--events/",
        relevanceScore: 8,
        confidence: "directional",
      },
      {
        title: "National Harbor weekend social block",
        summary:
          "Easy Oxon Hill hop for intentional joy + people — waterfront walks, seasonal festivals, or live events.",
        whyItMatters:
          "Nearby joy that recovers energy and keeps social life real without a long haul.",
        theme: "festival",
        region: "dmv",
        distanceTier: "nearby",
        city: "National Harbor, MD",
        venue: "National Harbor",
        startsOn: null,
        endsOn: null,
        dayFit: "weekend",
        driveMinutes: 15,
        sourceLabel: "National Harbor Events",
        sourceUrl: "https://nationalharbor.com/events/",
        relevanceScore: 7,
        confidence: "directional",
      },
      {
        title: "Baltimore weekend culture / network day",
        summary:
          "Regional drive for festivals, maker scenes, or RE-market walkabouts when the weekend is open.",
        whyItMatters:
          "Baltimore is on your future-property radar and a solid weekend network/culture stretch.",
        theme: "culture_social",
        region: "baltimore",
        distanceTier: "regional",
        city: "Baltimore, MD",
        venue: null,
        startsOn: null,
        endsOn: null,
        dayFit: "weekend",
        driveMinutes: 55,
        sourceLabel: "Visit Baltimore Events",
        sourceUrl: "https://baltimore.org/events/",
        relevanceScore: 6.5,
        confidence: "directional",
      },
      {
        title: "Richmond or Virginia Beach stretch (weekend only)",
        summary:
          "Only when energy and cash allow — festival, beach reset, or skill meetup as a capped weekend trip.",
        whyItMatters:
          "Stretch drives expand the world without pretending they fit an office evening.",
        theme: "festival",
        region: weekendBias ? "virginia_beach" : "richmond",
        distanceTier: "stretch",
        city: weekendBias ? "Virginia Beach, VA" : "Richmond, VA",
        venue: null,
        startsOn: null,
        endsOn: null,
        dayFit: "weekend_trip",
        driveMinutes: weekendBias ? 200 : 120,
        sourceLabel: weekendBias ? "Visit Virginia Beach Events" : "Visit Richmond Events",
        sourceUrl: weekendBias
          ? "https://www.visitvirginiabeach.com/events/"
          : "https://www.visitrichmondva.com/events/",
        relevanceScore: 5.5,
        confidence: "directional",
      },
    ],
  };
}

function parseGeneratedEvents(raw: unknown, dayShape: string) {
  const fallback = fallbackDigest(dayShape);
  if (!raw || typeof raw !== "object") return fallback;

  const data = raw as Record<string, unknown>;
  const radarRaw = (data.radar ?? data.mainThing) as Record<string, unknown> | undefined;
  const radar: GeneratedRadar = {
    title:
      typeof radarRaw?.title === "string" && radarRaw.title.trim()
        ? radarRaw.title.trim().slice(0, 120)
        : fallback.radar.title,
    why:
      typeof radarRaw?.why === "string" && radarRaw.why.trim()
        ? radarRaw.why.trim().slice(0, 280)
        : fallback.radar.why,
    oneAction:
      typeof radarRaw?.oneAction === "string" && radarRaw.oneAction.trim()
        ? radarRaw.oneAction.trim().slice(0, 180)
        : fallback.radar.oneAction,
  };

  const focusGuardrail =
    typeof data.focusGuardrail === "string" && data.focusGuardrail.trim()
      ? data.focusGuardrail.trim().slice(0, 280)
      : DEFAULT_GUARDRAIL;

  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const items: GeneratedEventItem[] = [];

  for (const row of itemsRaw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) continue;

    const theme =
      typeof item.theme === "string" && isLocalEventTheme(item.theme)
        ? item.theme
        : "networking";
    const region =
      typeof item.region === "string" && isLocalEventRegion(item.region)
        ? item.region
        : "dmv";
    const distanceTier =
      typeof item.distanceTier === "string" && isLocalEventDistanceTier(item.distanceTier)
        ? item.distanceTier
        : region === "dmv"
          ? "nearby"
          : region === "baltimore"
            ? "regional"
            : "stretch";
    const dayFit =
      typeof item.dayFit === "string" && isLocalEventDayFit(item.dayFit)
        ? item.dayFit
        : distanceTier === "stretch"
          ? "weekend_trip"
          : distanceTier === "regional"
            ? "weekend"
            : "evening";
    const confidence =
      typeof item.confidence === "string" && isLocalEventConfidence(item.confidence)
        ? item.confidence
        : "directional";

    items.push({
      title: title.slice(0, 160),
      summary:
        typeof item.summary === "string" && item.summary.trim()
          ? item.summary.trim().slice(0, 320)
          : "Local outing worth a look.",
      whyItMatters:
        typeof item.whyItMatters === "string" && item.whyItMatters.trim()
          ? item.whyItMatters.trim().slice(0, 280)
          : "Aligns with network, skill, or intentional joy goals.",
      theme,
      region,
      distanceTier,
      city: asOptionalString(item.city, 80),
      venue: asOptionalString(item.venue, 120),
      startsOn: asOptionalDate(item.startsOn),
      endsOn: asOptionalDate(item.endsOn),
      dayFit,
      driveMinutes: asOptionalMinutes(item.driveMinutes),
      sourceLabel:
        typeof item.sourceLabel === "string" && item.sourceLabel.trim()
          ? item.sourceLabel.trim().slice(0, 80)
          : "Local events radar",
      sourceUrl: asOptionalString(item.sourceUrl, 400),
      relevanceScore: clampScore(item.relevanceScore),
      confidence,
    });

    if (items.length >= MAX_LOCAL_EVENT_ITEMS) break;
  }

  return {
    radar,
    focusGuardrail,
    items: items.length > 0 ? items : fallback.items,
  };
}

async function gatherLocalEventsContext(userId: string) {
  const now = DateTime.now().setZone(USER_TIME_ZONE);
  const dayShape = dayShapeFor(now.weekday);

  const [profile, goals, activities, contacts, sourceSnapshots] = await Promise.all([
    prisma.lifeLeverageProfile.findUnique({ where: { userId } }),
    prisma.financialGoal.findMany({
      where: { userId, status: "active" },
      take: 12,
      select: { name: true, category: true, targetDate: true, priority: true },
    }),
    prisma.growthActivity.findMany({
      where: {
        userId,
        domain: { in: ["social", "career", "startup", "fitness"] },
      },
      orderBy: { date: "desc" },
      take: 20,
      select: { date: true, domain: true, title: true, category: true },
    }),
    prisma.growthContact.findMany({
      where: { userId, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        name: true,
        relationshipType: true,
        suggestedNextAction: true,
        lastContactDate: true,
      },
    }),
    fetchEventSourceSnapshots(),
  ]);

  return {
    homeBase:
      "Oxon Hill, Prince George's County, Maryland — DMV. Car available for regional drives.",
    dayShape,
    weekday: now.weekday,
    date: now.toISODate(),
    distanceRules: {
      nearby: "Oxon Hill / National Harbor / PG / DC / close NoVa — evening OK on office days",
      regional: "Baltimore / deeper NoVa — prefer Thu evening or weekend",
      stretch: "Richmond / Virginia Beach — weekend day-trip or overnight only",
    },
    goalFit:
      "Prioritize events that put Trell around people (networking, founder/builder, dating/social), teach a skill, festivals with energy, fitness, or real-estate market learning — not random bars with no upside.",
    profile: profile
      ? {
          promotionTarget: profile.promotionTarget,
          promotionDeadline: profile.promotionDeadline,
          notes: profile.notes,
        }
      : null,
    goals,
    recentSocialCareerActivities: activities,
    contacts: contacts.map((c) => ({
      name: c.name,
      type: c.relationshipType,
      lastContact: c.lastContactDate,
      suggestedNext: c.suggestedNextAction,
    })),
    sources: LOCAL_EVENT_SOURCE_ALLOWLIST,
    sourceSnapshots,
  };
}

export async function getLocalEventDigestForDate(userId: string, date: string) {
  return prisma.localEventDigest.findUnique({
    where: { userId_date: { userId, date } },
    include: {
      items: {
        orderBy: [{ relevanceScore: "desc" }, { startsOn: "asc" }],
      },
    },
  });
}

export function serializeLocalEventDigest(
  digest: NonNullable<Awaited<ReturnType<typeof getLocalEventDigestForDate>>>
) {
  return {
    id: digest.id,
    date: digest.date,
    radar: {
      title: digest.radarTitle,
      why: digest.radarWhy,
      oneAction: digest.radarAction,
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
      region: item.region,
      distanceTier: item.distanceTier,
      city: item.city,
      venue: item.venue,
      startsOn: item.startsOn,
      endsOn: item.endsOn,
      dayFit: item.dayFit,
      driveMinutes: item.driveMinutes,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      relevanceScore: item.relevanceScore,
      confidence: item.confidence,
      status: item.status,
      loggedActivityId: item.loggedActivityId,
    })),
  };
}

export type LocalEventDigestSerialized = ReturnType<typeof serializeLocalEventDigest>;

/** Compact pack for coach / growth agent prompts. */
export function serializeLocalEventsForAgent(
  digest: LocalEventDigestSerialized | null
) {
  if (!digest) return null;
  const active = digest.items.filter(
    (item) => item.status !== "dismissed" && item.status !== "attended"
  );
  return {
    note: "BACKGROUND SIGNAL — suggest at most one event when it compounds network/skill/joy and fits day shape. Do not fill the week with random drives. Stretch regions are weekend-only.",
    radar: digest.radar,
    focusGuardrail: digest.focusGuardrail,
    topEvents: active.slice(0, 5).map((item) => ({
      title: item.title,
      theme: item.theme,
      region: item.region,
      distanceTier: item.distanceTier,
      dayFit: item.dayFit,
      startsOn: item.startsOn,
      city: item.city,
      whyItMatters: item.whyItMatters,
      sourceUrl: item.sourceUrl,
      confidence: item.confidence,
      status: item.status,
    })),
  };
}

export async function generateLocalEventDigest(
  userId: string,
  options?: { force?: boolean }
) {
  const today = DateTime.now().setZone(USER_TIME_ZONE).toISODate()!;
  const existing = await getLocalEventDigestForDate(userId, today);

  if (existing && !options?.force) {
    return { digest: existing, refreshed: false, alreadyFresh: true };
  }

  const context = await gatherLocalEventsContext(userId);
  let generated = parseGeneratedEvents(null, context.dayShape);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You curate a personal LOCAL EVENTS radar for Trell — software engineer + aspiring founder in Oxon Hill / DMV with a car.

Mission: surface real outings that compound his life goals — put him around people (networking, founder/builder, intentional social/dating), teach skills, festivals with energy, fitness/body, or real-estate market learning. Skip low-ROI random nightlife with nothing to show.

Geography / distance from Oxon Hill:
- nearby (DMV): National Harbor, PG, DC, close NoVa — evening OK on office days
- regional (Baltimore / deeper NoVa): prefer Thu evening or weekend
- stretch (Richmond, Virginia Beach): weekend day-trip or overnight ONLY

HARD RULES:
- Prefer events grounded in sourceSnapshots headings/links. If a snapshot is empty, mark confidence "directional" and point at the source URL to check — do NOT invent fake dated ticketed events.
- 4–8 items max. Mix nearby + optional regional; include at most 1–2 stretch items and only when dayShape is weekend OR as "next weekend" radar.
- themes: networking | festival | learning_skill | founder_startup | fitness_body | culture_social | real_estate_housing | music_arts
- regions: dmv | baltimore | richmond | virginia_beach
- distanceTier: nearby | regional | stretch
- dayFit: evening | wfh_flex | weekend | weekend_trip
- Respect dayShape in CONTEXT: office = nearby evening only; wfh = nearby/evening or short regional; weekend can hold regional + one stretch.
- Strings short and scannable. whyItMatters ties to Trell's goals (network equity, skill, body, joy, next-property awareness).
- Never recommend starting a new unfinished side project from an event.`,
        },
        {
          role: "user",
          content: `Build today's local events radar.

Return JSON exactly:
{
  "radar": {
    "title": "short focus title",
    "why": "why this fits Trell this week",
    "oneAction": "one concrete next step"
  },
  "focusGuardrail": "one sentence cap on over-scheduling",
  "items": [
    {
      "title": "...",
      "summary": "2 sentences max",
      "whyItMatters": "why for Trell's goals",
      "theme": "networking",
      "region": "dmv",
      "distanceTier": "nearby",
      "city": "Washington, DC",
      "venue": "optional",
      "startsOn": "YYYY-MM-DD or null",
      "endsOn": "YYYY-MM-DD or null",
      "dayFit": "evening",
      "driveMinutes": 35,
      "sourceLabel": "from allowlist when possible",
      "sourceUrl": "https://...",
      "relevanceScore": 8,
      "confidence": "confirmed"
    }
  ]
}

CONTEXT:
${JSON.stringify(context)}`,
        },
      ],
      max_completion_tokens: 2800,
      reasoning_effort: "minimal",
      verbosity: "low",
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      generated = parseGeneratedEvents(JSON.parse(content), context.dayShape);
    }
  } catch (error) {
    console.error("Local events AI failed; using fallback:", error);
  }

  if (existing) {
    await prisma.localEventItem.deleteMany({ where: { digestId: existing.id } });
    await prisma.localEventDigest.delete({ where: { id: existing.id } });
  }

  const digest = await prisma.localEventDigest.create({
    data: {
      userId,
      date: today,
      radarTitle: generated.radar.title,
      radarWhy: generated.radar.why,
      radarAction: generated.radar.oneAction,
      focusGuardrail: generated.focusGuardrail,
      items: {
        create: generated.items.map((item) => ({
          title: item.title,
          summary: item.summary,
          whyItMatters: item.whyItMatters,
          theme: item.theme,
          region: item.region,
          distanceTier: item.distanceTier,
          city: item.city,
          venue: item.venue,
          startsOn: item.startsOn,
          endsOn: item.endsOn,
          dayFit: item.dayFit,
          driveMinutes: item.driveMinutes,
          sourceLabel: item.sourceLabel,
          sourceUrl: item.sourceUrl,
          relevanceScore: item.relevanceScore,
          confidence: item.confidence,
          status: "new",
        })),
      },
    },
    include: {
      items: {
        orderBy: [{ relevanceScore: "desc" }, { startsOn: "asc" }],
      },
    },
  });

  return { digest, refreshed: true, alreadyFresh: false };
}
