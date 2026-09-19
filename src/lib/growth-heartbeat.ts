import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { USER_TIME_ZONE, userToday, userWeekday } from "@/lib/user-timezone";

/** Quiet days before the compounding score starts taking a heartbeat haircut. */
export const HEARTBEAT_GRACE_DAYS = 2;

/** Email if the OS has been quiet at least this long. */
export const HEARTBEAT_EMAIL_IDLE_DAYS = 3;

const HEARTBEAT_EMAIL_WEEKDAYS = new Set([1, 4]); // Mon + Thu in America/New_York

const HEARTBEAT_TO =
  process.env.LIFE_OS_ALERT_EMAIL?.trim() || "mjubil96@gmail.com";

export type HeartbeatState = {
  daysInactive: number;
  lastUserTouchDate: string | null;
  decaying: boolean;
  scoreMultiplier: number;
};

type HeartbeatEmailMetrics = {
  compoundingScore: number;
  heartbeat?: HeartbeatState;
  contactsNeedingAttention: Array<{
    name: string;
    daysSinceContact: number | null;
    status: string;
  }>;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

function toUserIsoDate(value: Date | null | undefined) {
  if (!value) return null;
  const dt = DateTime.fromJSDate(value).setZone(USER_TIME_ZONE);
  return dt.isValid ? dt.toISODate() : null;
}

export function inactivityDecayMultiplier(daysInactive: number) {
  if (daysInactive <= HEARTBEAT_GRACE_DAYS) return 1;
  const excess = daysInactive - HEARTBEAT_GRACE_DAYS;
  // ~7 quiet days ≈ 0.70 (project-went-quiet analog); floor so history is not erased.
  return Math.max(0.48, Math.exp(-excess / 14));
}

export function applyHeartbeatToScore(score: number, daysInactive: number) {
  return clampScore(score * inactivityDecayMultiplier(daysInactive));
}

export function daysInactiveSince(lastTouchDate: string | null, today: string) {
  if (!lastTouchDate) return 0;
  const a = DateTime.fromISO(lastTouchDate, { zone: USER_TIME_ZONE });
  const b = DateTime.fromISO(today, { zone: USER_TIME_ZONE });
  if (!a.isValid || !b.isValid) return 0;
  return Math.max(0, Math.floor(b.diff(a, "days").days));
}

export function buildHeartbeatState(lastTouchDate: string | null, today: string): HeartbeatState {
  const daysInactive = daysInactiveSince(lastTouchDate, today);
  const scoreMultiplier = inactivityDecayMultiplier(daysInactive);
  return {
    daysInactive,
    lastUserTouchDate: lastTouchDate,
    decaying: daysInactive > HEARTBEAT_GRACE_DAYS,
    scoreMultiplier,
  };
}

/**
 * Last time Trell actually updated Life OS — not calendar auto-logs, not cron.
 * Coach notes, manual activities / planner checkoffs, people, and contact notes count.
 */
export async function findLastUserTouchDate(userId: string): Promise<string | null> {
  const [note, manualActivity, coachMessage, contact] = await Promise.all([
    prisma.growthContactNote.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.growthActivity.findFirst({
      where: { userId, sourceCalendarEventId: null },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.coachMessage.findFirst({
      where: { userId, role: "user" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.growthContact.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const stamps = [
    toUserIsoDate(note?.createdAt),
    toUserIsoDate(manualActivity?.updatedAt),
    toUserIsoDate(coachMessage?.createdAt),
    toUserIsoDate(contact?.updatedAt),
  ].filter((value): value is string => Boolean(value));

  if (stamps.length === 0) return null;
  return stamps.sort().at(-1) ?? null;
}

export function shouldSendHeartbeatEmail(input: {
  daysInactive: number;
  weekday?: number;
}) {
  if (input.daysInactive < HEARTBEAT_EMAIL_IDLE_DAYS) return false;
  const weekday = input.weekday ?? userWeekday();
  return HEARTBEAT_EMAIL_WEEKDAYS.has(weekday);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildHeartbeatEmail(metrics: HeartbeatEmailMetrics) {
  const days = metrics.heartbeat?.daysInactive ?? 0;
  const followUps = metrics.contactsNeedingAttention.slice(0, 8);
  const followUpRows =
    followUps.length > 0
      ? followUps
          .map((contact) => {
            const wait =
              contact.daysSinceContact != null
                ? `${contact.daysSinceContact} days since last contact`
                : contact.status;
            return `<li><strong>${escapeHtml(contact.name)}</strong> — ${escapeHtml(wait)}</li>`;
          })
          .join("")
      : "<li>No tagged follow-ups yet — open People and log one touch.</li>";

  const subject =
    followUps.length > 0
      ? `Don't forget your follow-ups (${followUps.length} waiting)`
      : "Life OS went quiet — don't lose the streak";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a;">
      <p>Life OS has been quiet for <strong>${days} day${days === 1 ? "" : "s"}</strong>.</p>
      <p>Compounding score is now <strong>${Math.round(metrics.compoundingScore)}</strong>/100 — unused systems decay the same way a paused project does.</p>
      <p><strong>Don't forget to do your follow-ups:</strong></p>
      <ul>${followUpRows}</ul>
      <p>Open Life OS → More → People, send one focused message, and the heartbeat comes back.</p>
    </div>
  `;

  return { to: HEARTBEAT_TO, subject, html };
}

export async function maybeSendHeartbeatEmail(metrics: HeartbeatEmailMetrics) {
  if (!shouldSendHeartbeatEmail({ daysInactive: metrics.heartbeat?.daysInactive ?? 0 })) {
    return { sent: false as const, reason: "not-due" };
  }

  const payload = buildHeartbeatEmail(metrics);
  await sendEmail(payload);
  return { sent: true as const, to: payload.to, subject: payload.subject };
}

export async function loadHeartbeatState(userId: string): Promise<HeartbeatState> {
  const lastTouch = await findLastUserTouchDate(userId);
  return buildHeartbeatState(lastTouch, userToday());
}
