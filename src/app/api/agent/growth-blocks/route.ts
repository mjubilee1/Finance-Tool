import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildCeoEventDescription,
  ceoCalendarTitle,
  isCeoBlockType,
  saturdayEventDecision,
} from "@/lib/agenda-policy";
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";
import { USER_TIME_ZONE } from "@/lib/user-timezone";

const inputSchema = z.object({
  externalId: z.string().trim().min(1).max(120),
  blockType: z.string().refine(isCeoBlockType, "Invalid blockType"),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  detail: z.string().trim().max(100).optional(),
  outcome: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(1500).optional(),
  signal: z.enum(["high", "normal"]).default("normal"),
  people: z.array(z.string().trim().min(1).max(80)).max(2).optional(),
});

function authorized(request: Request) {
  const secret = process.env.LIFE_OS_AGENT_API_KEY?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function owner() {
  const email = process.env.LIFE_OS_OWNER_EMAIL?.trim();
  if (email) return prisma.user.findUnique({ where: { email } });
  return prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await owner();
  if (!user) return NextResponse.json({ error: "Life OS owner not found" }, { status: 404 });

  const blocks = await prisma.agentGrowthBlock.findMany({
    where: { userId: user.id, status: "scheduled", endsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 30,
  });
  return NextResponse.json({ blocks });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid growth block", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const user = await owner();
  if (!user) return NextResponse.json({ error: "Life OS owner not found" }, { status: 404 });

  const startsAt = DateTime.fromISO(input.startsAt, { setZone: true }).setZone(USER_TIME_ZONE);
  const endsAt = DateTime.fromISO(input.endsAt, { setZone: true }).setZone(USER_TIME_ZONE);
  if (!startsAt.isValid || !endsAt.isValid || endsAt <= startsAt) {
    return NextResponse.json({ error: "endsAt must be after startsAt" }, { status: 400 });
  }
  if (startsAt < DateTime.now().setZone(USER_TIME_ZONE).minus({ minutes: 5 })) {
    return NextResponse.json({ error: "Growth blocks must be scheduled in the future" }, { status: 400 });
  }
  if (startsAt.weekday <= 5 && startsAt.hour < 17) {
    return NextResponse.json(
      { error: "CEO growth writes are limited to weekday evenings or weekends." },
      { status: 409 },
    );
  }
  if (input.blockType === "people" && (!input.people?.length || input.people.length > 2)) {
    return NextResponse.json(
      { error: "People blocks need one or two named reach-outs." },
      { status: 400 },
    );
  }
  if (input.blockType === "high_signal_event") {
    const decision = saturdayEventDecision({ startsAt, endsAt, signal: input.signal });
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: 409 });
    }
    if (input.signal !== "high") {
      return NextResponse.json(
        { error: "Events must be explicitly marked high-signal before they enter the growth calendar." },
        { status: 409 },
      );
    }
  }

  const detail =
    input.blockType === "people" ? input.people!.join(", ") : input.detail;
  const title = ceoCalendarTitle(input.blockType, detail);
  const description = buildCeoEventDescription({
    blockType: input.blockType,
    externalId: input.externalId,
    outcome: input.outcome,
    notes: input.notes,
  });
  const existing = await prisma.agentGrowthBlock.findUnique({
    where: { userId_externalId: { userId: user.id, externalId: input.externalId } },
  });
  const calendarInput = {
    summary: title,
    start: startsAt.toISO()!,
    end: endsAt.toISO()!,
    timeZone: USER_TIME_ZONE,
    description,
  };

  const event = existing?.calendarEventId
    ? await updateGoogleCalendarEvent(user.id, {
        ...calendarInput,
        eventId: existing.calendarEventId,
      })
    : await createGoogleCalendarEvent(user.id, calendarInput);
  if (!event) {
    return NextResponse.json({ error: "Google Calendar did not return the event." }, { status: 502 });
  }

  const block = await prisma.agentGrowthBlock.upsert({
    where: { userId_externalId: { userId: user.id, externalId: input.externalId } },
    create: {
      userId: user.id,
      externalId: input.externalId,
      calendarEventId: event.id,
      blockType: input.blockType,
      title,
      startsAt: startsAt.toJSDate(),
      endsAt: endsAt.toJSDate(),
    },
    update: {
      calendarEventId: event.id,
      blockType: input.blockType,
      title,
      startsAt: startsAt.toJSDate(),
      endsAt: endsAt.toJSDate(),
      status: "scheduled",
    },
  });

  return NextResponse.json({ block, calendarEvent: event }, { status: existing ? 200 : 201 });
}
