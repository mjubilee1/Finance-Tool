import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { createPlannerItem } from "@/lib/planner";
import {
  fetchUpcomingGoogleCalendarEvents,
  type GoogleCalendarEvent,
} from "@/lib/google-calendar";
import { calendarDateTime, userNow } from "@/lib/user-timezone";

export const ENTREPRENEURSHIP_MARKER_PREFIX = "entrepreneurship:";
export const ENTREPRENEURSHIP_SECTION_LABEL = "Entrepreneurship & Business Growth";

export const ENTREPRENEURSHIP_WEEKLY_TARGETS = [
  "25–50 qualified LinkedIn connection requests",
  "10 direct professional emails where appropriate",
  "3–5 conversations scheduled",
  "2–4 interviews completed",
  "At least one documented market insight",
  "One concise evidence-based update for your technical partner",
] as const;

export type EntrepreneurshipPipelineStage =
  | "no_pipeline"
  | "interview_upcoming"
  | "post_interview"
  | "serious_interest";

export type EntrepreneurshipSlot =
  | "outreach"
  | "prospect_research"
  | "customer_discovery"
  | "market_research"
  | "positioning"
  | "partner_update"
  | "interview_prep"
  | "synthesize"
  | "serious_followup";

export type EntrepreneurshipTaskTemplate = {
  slot: EntrepreneurshipSlot;
  title: string;
  minutes: number;
  timeLabel: string;
  detail: string;
};

const INTERVIEW_RE =
  /\b(interview|customer discovery|discovery call|user interview|customer call|prospect call|demo call)\b/i;
const SERIOUS_INTEREST_RE =
  /\b(demo|pilot|pricing|proposal|interested|follow[- ]?up|procurement|buy|purchase|trial)\b/i;
const WORKING_CLAIM =
  "A private AI tool that turns litigation case files into a source-cited chronological timeline without uploading confidential files to a public AI service.";

export function entrepreneurshipMarker(slot: EntrepreneurshipSlot) {
  return `${ENTREPRENEURSHIP_MARKER_PREFIX}${slot}`;
}

export function isEntrepreneurshipNotes(notes: string | null | undefined) {
  return Boolean(notes?.includes(ENTREPRENEURSHIP_MARKER_PREFIX));
}

export function parseEntrepreneurshipSlot(notes: string | null | undefined): EntrepreneurshipSlot | null {
  if (!notes) return null;
  const match = notes.match(/entrepreneurship:([a-z_]+)/i);
  if (!match?.[1]) return null;
  return match[1] as EntrepreneurshipSlot;
}

function notesWithMarker(slot: EntrepreneurshipSlot, detail: string) {
  return `${detail}\n\n${entrepreneurshipMarker(slot)}`;
}

function eventText(event: GoogleCalendarEvent) {
  return `${event.title} ${event.location ?? ""} ${event.description ?? ""}`;
}

function isInterviewEvent(event: GoogleCalendarEvent) {
  return INTERVIEW_RE.test(eventText(event));
}

function isSeriousInterestEvent(event: GoogleCalendarEvent) {
  const text = eventText(event);
  if (isInterviewEvent(event) && !/\b(demo|pilot)\b/i.test(text)) return false;
  return SERIOUS_INTEREST_RE.test(text);
}

export async function detectEntrepreneurshipPipelineStage(
  userId: string,
  todayIso = userNow().toISODate()!,
  suppliedEvents?: GoogleCalendarEvent[],
): Promise<{
  stage: EntrepreneurshipPipelineStage;
  upcomingInterviewTitle: string | null;
}> {
  const today = DateTime.fromISO(todayIso).startOf("day");
  const horizon = today.plus({ days: 7 }).endOf("day");
  const yesterday = today.minus({ days: 1 }).toISODate()!;

  let events = suppliedEvents ?? [];
  if (!suppliedEvents) {
    try {
      const calendar = await fetchUpcomingGoogleCalendarEvents(userId, {
        timeMin: today.minus({ days: 1 }).toJSDate(),
        timeMax: horizon.toJSDate(),
        maxResults: 50,
      });
      events = calendar.events;
    } catch {
      events = [];
    }
  }

  const upcomingInterview = events.find((event) => {
    if (!isInterviewEvent(event)) return false;
    const start = calendarDateTime(event.start);
    if (!start.isValid) return false;
    return start >= today && start <= horizon;
  });

  const interviewEarlierToday = events.find((event) => {
    if (!isInterviewEvent(event)) return false;
    const start = calendarDateTime(event.start);
    if (!start.isValid) return false;
    return start.hasSame(today, "day") && start < userNow();
  });

  const seriousEvent = events.find((event) => {
    const start = calendarDateTime(event.start);
    if (!start.isValid) return false;
    return start >= today && start <= horizon && isSeriousInterestEvent(event);
  });

  const recentDiscoveryDone = await prisma.growthActivity.findFirst({
    where: {
      userId,
      category: "user_plan",
      domain: "startup",
      status: "done",
      date: { in: [todayIso, yesterday] },
      OR: [
        { notes: { contains: entrepreneurshipMarker("customer_discovery") } },
        { notes: { contains: entrepreneurshipMarker("interview_prep") } },
        { notes: { contains: entrepreneurshipMarker("synthesize") } },
        { title: { contains: "discovery", mode: "insensitive" } },
        { title: { contains: "interview", mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  const recentSeriousNotes = await prisma.growthContactNote.findFirst({
    where: {
      userId,
      createdAt: { gte: today.minus({ days: 14 }).toJSDate() },
      OR: [
        { body: { contains: "pilot", mode: "insensitive" } },
        { body: { contains: "demo", mode: "insensitive" } },
        { body: { contains: "pricing", mode: "insensitive" } },
        { body: { contains: "interested", mode: "insensitive" } },
      ],
    },
  });

  if (seriousEvent || recentSeriousNotes) {
    return {
      stage: "serious_interest",
      upcomingInterviewTitle: upcomingInterview?.title ?? null,
    };
  }

  if (interviewEarlierToday || recentDiscoveryDone) {
    return {
      stage: "post_interview",
      upcomingInterviewTitle: upcomingInterview?.title ?? interviewEarlierToday?.title ?? null,
    };
  }

  if (upcomingInterview) {
    return {
      stage: "interview_upcoming",
      upcomingInterviewTitle: upcomingInterview.title,
    };
  }

  return { stage: "no_pipeline", upcomingInterviewTitle: null };
}

export function buildEntrepreneurshipTasksForStage(params: {
  stage: EntrepreneurshipPipelineStage;
  upcomingInterviewTitle: string | null;
}): EntrepreneurshipTaskTemplate[] {
  const { stage, upcomingInterviewTitle } = params;
  const interviewLabel = upcomingInterviewTitle?.trim() || "scheduled discovery call";

  const outreach: EntrepreneurshipTaskTemplate = {
    slot: "outreach",
    title: "Outreach — 5–10 LinkedIn requests (10–15 min)",
    minutes: 15,
    timeLabel: "10–15 min",
    detail:
      "Send 5–10 targeted LinkedIn connection requests to DMV litigation prospects. Message new connections who accepted. Follow up once with prospects quiet for 5+ business days. Do not repeatedly contact the same person.",
  };

  const prospectResearch: EntrepreneurshipTaskTemplate = {
    slot: "prospect_research",
    title: "Prospect research — qualify 5 new leads (20–30 min)",
    minutes: 30,
    timeLabel: "20–30 min",
    detail:
      "Find and qualify 5 new prospects. Prioritize litigation paralegals, associates, small-firm owners, firm administrators, and litigation-support pros in DC / MD / Northern VA. Record name, role, firm, practice area, location, LinkedIn, contact status, and next action. Aim for a backlog of at least 25 qualified prospects.",
  };

  const discoveryBook: EntrepreneurshipTaskTemplate = {
    slot: "customer_discovery",
    title: "Customer discovery — book or research (20–30 min)",
    minutes: 30,
    timeLabel: "20–30 min",
    detail:
      "No interview on the calendar today. Work booking: research firms, find local legal events, or request warm intros. Prep question bank on past behavior — how firms build timelines, time spent, current tools, privacy restrictions, mistakes, frequency, and purchasing authority.",
  };

  const discoveryConduct: EntrepreneurshipTaskTemplate = {
    slot: "customer_discovery",
    title: `Customer discovery — run ${interviewLabel} (20–30 min)`,
    minutes: 30,
    timeLabel: "20–30 min",
    detail:
      "Conduct the scheduled interview and record findings. Focus on past behavior: how they build timelines, time spent, tools used, privacy restrictions, mistakes, frequency, and who buys. Capture quotes separately from your assumptions.",
  };

  const interviewPrep: EntrepreneurshipTaskTemplate = {
    slot: "interview_prep",
    title: `Prep for ${interviewLabel} (15–20 min)`,
    minutes: 20,
    timeLabel: "15–20 min",
    detail:
      "Prepare for the upcoming discovery call: firm background, role, hypothesis questions on timeline workflows, privacy, tools, and buying authority. Do not invent answers — prepare to listen for repeated evidence.",
  };

  const marketResearch: EntrepreneurshipTaskTemplate = {
    slot: "market_research",
    title: "Market & competitor research (20 min)",
    minutes: 20,
    timeLabel: "20 min",
    detail:
      "Research one competing product, alternative workflow, or legal-tech trend. Record target customer, positioning, features, pricing if available, strengths, weaknesses, and differentiation. Treat manual work, spreadsheets, existing legal software, and general AI tools as competitors.",
  };

  const positioning: EntrepreneurshipTaskTemplate = {
    slot: "positioning",
    title: "Positioning & offer development (15 min)",
    minutes: 15,
    timeLabel: "15 min",
    detail: `Refine customer segment, problem statement, value proposition, pilot offer, or pricing hypothesis. Working claim: “${WORKING_CLAIM}” Avoid pivoting on one opinion — look for repeated evidence across interviews.`,
  };

  const partnerUpdate: EntrepreneurshipTaskTemplate = {
    slot: "partner_update",
    title: "Partner update — evidence brief (10 min)",
    minutes: 10,
    timeLabel: "10 min",
    detail:
      "Summarize discoveries for your technical partner: customer quotes, repeated problems, requested capabilities, objections, privacy requirements, purchasing info, and recommended product priorities. Separate verified customer evidence from assumptions.",
  };

  const synthesize: EntrepreneurshipTaskTemplate = {
    slot: "synthesize",
    title: "Synthesize interview findings (20–25 min)",
    minutes: 25,
    timeLabel: "20–25 min",
    detail:
      "Write up what you heard: timeline workflow, time cost, tools, privacy constraints, mistakes, frequency, buying authority. Tag patterns vs one-off opinions. Feed the partner update with evidence only.",
  };

  const seriousFollowup: EntrepreneurshipTaskTemplate = {
    slot: "serious_followup",
    title: "Serious interest — follow-up / demo / pilot prep (20–30 min)",
    minutes: 25,
    timeLabel: "20–30 min",
    detail:
      "Someone showed serious interest. Send a concrete follow-up, prepare a demo agenda, or draft pilot scope/privacy constraints. Do not stall on generic prospecting while this is warm.",
  };

  switch (stage) {
    case "interview_upcoming":
      return [
        interviewPrep,
        outreach,
        prospectResearch,
        discoveryConduct,
        marketResearch,
        positioning,
        partnerUpdate,
      ];
    case "post_interview":
      return [
        synthesize,
        partnerUpdate,
        outreach,
        prospectResearch,
        marketResearch,
        positioning,
      ];
    case "serious_interest":
      return [
        seriousFollowup,
        partnerUpdate,
        outreach,
        prospectResearch,
        marketResearch,
        positioning,
      ];
    case "no_pipeline":
    default:
      return [
        outreach,
        prospectResearch,
        discoveryBook,
        marketResearch,
        positioning,
        partnerUpdate,
      ];
  }
}

/**
 * Idempotently seed today's entrepreneurship planner items.
 * Uses notes marker entrepreneurship:<slot> so reloads never duplicate.
 */
export async function ensureEntrepreneurshipRoutineForToday(
  userId: string,
  options?: { calendarEvents?: GoogleCalendarEvent[] },
) {
  const today = userNow().toISODate()!;
  const { stage, upcomingInterviewTitle } = await detectEntrepreneurshipPipelineStage(
    userId,
    today,
    options?.calendarEvents,
  );
  const templates = buildEntrepreneurshipTasksForStage({ stage, upcomingInterviewTitle });

  const existing = await prisma.growthActivity.findMany({
    where: {
      userId,
      date: today,
      category: "user_plan",
      notes: { contains: ENTREPRENEURSHIP_MARKER_PREFIX },
    },
    select: { id: true, notes: true, status: true, title: true },
  });

  const existingSlots = new Set(
    existing
      .map((row) => parseEntrepreneurshipSlot(row.notes))
      .filter((slot): slot is EntrepreneurshipSlot => Boolean(slot)),
  );

  const created: string[] = [];
  for (const template of templates) {
    if (existingSlots.has(template.slot)) continue;

    const activity = await createPlannerItem(userId, {
      date: today,
      title: template.title.slice(0, 160),
      domain: "startup",
      notes: notesWithMarker(template.slot, template.detail),
      minutesSpent: template.minutes,
      timeLabel: template.timeLabel,
      status: "planned",
    });
    created.push(activity.id);
    existingSlots.add(template.slot);
  }

  const weekStart = userNow().startOf("week").toISODate()!;
  const weekDone = await prisma.growthActivity.count({
    where: {
      userId,
      category: "user_plan",
      domain: "startup",
      status: "done",
      date: { gte: weekStart, lte: today },
      notes: { contains: ENTREPRENEURSHIP_MARKER_PREFIX },
    },
  });

  return {
    stage,
    upcomingInterviewTitle,
    createdCount: created.length,
    weekDoneCount: weekDone,
    weeklyTargets: [...ENTREPRENEURSHIP_WEEKLY_TARGETS],
    sectionLabel: ENTREPRENEURSHIP_SECTION_LABEL,
  };
}

export async function getEntrepreneurshipWeekProgress(userId: string) {
  const today = userNow().toISODate()!;
  const weekStart = userNow().startOf("week").toISODate()!;
  const rows = await prisma.growthActivity.findMany({
    where: {
      userId,
      category: "user_plan",
      domain: "startup",
      date: { gte: weekStart, lte: today },
      notes: { contains: ENTREPRENEURSHIP_MARKER_PREFIX },
    },
    select: { status: true, notes: true },
  });

  const doneSlots = rows
    .filter((row) => row.status === "done")
    .map((row) => parseEntrepreneurshipSlot(row.notes))
    .filter((slot): slot is EntrepreneurshipSlot => Boolean(slot));

  return {
    doneCount: doneSlots.length,
    plannedCount: rows.filter((row) => row.status === "planned").length,
    doneSlots: [...new Set(doneSlots)],
  };
}
