import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildLifePulse } from "@/lib/life-pulse";
import { calendarDateTime, userToday } from "@/lib/user-timezone";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function appUrl() {
  const configured =
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (!configured) return null;
  const withProtocol = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  return withProtocol.replace(/\/$/, "");
}

function formatTime(start: string, end: string | null) {
  const from = calendarDateTime(start);
  const to = end ? calendarDateTime(end) : null;
  if (!from.isValid) return "Time TBD";
  const fromLabel = from.toFormat("h:mm a").replace(":00", "");
  const toLabel = to?.isValid ? to.toFormat("h:mm a").replace(":00", "") : null;
  return toLabel ? `${fromLabel}–${toLabel}` : fromLabel;
}

export async function maybeSendDailyPlanEmail(user: {
  id: string;
  email: string | null;
  name: string | null;
}) {
  const today = userToday();
  const settings = await prisma.dailyPlanningSettings.findUnique({
    where: { userId: user.id },
  });
  if (!settings?.emailEnabled) {
    return { sent: false as const, reason: "disabled" };
  }
  if (settings.lastEmailDate === today) {
    return { sent: false as const, reason: "already-sent" };
  }
  if (!user.email) {
    return { sent: false as const, reason: "missing-email" };
  }
  if (!process.env.RESEND_API_KEY?.trim()) {
    return { sent: false as const, reason: "email-not-configured" };
  }

  const pulse = await buildLifePulse(user.id, {
    includeNetwork: false,
    ensureEntrepreneurship: false,
    calendarDaysAhead: 1,
    memoryLimit: 2,
  });
  const brief = pulse.todayBrief;
  const schedule = [...pulse.todayCalendarEvents, ...pulse.todayRoutineEvents].sort(
    (a, b) => calendarDateTime(a.start).toMillis() - calendarDateTime(b.start).toMillis(),
  );
  const openTasks = brief.userPlanBlocks
    .filter((item) => item.status === "planned")
    .slice(0, 5);

  const mainThing =
    brief.recommendation?.status === "pending"
      ? brief.recommendation.action
      : openTasks[0]?.title ||
        brief.plan.blocks.find((block) => block.priority === "protect")?.label ||
        "Open Today and choose the one move that matters most.";

  const scheduleRows =
    schedule.length > 0
      ? schedule
          .map(
            (event) =>
              `<li style="margin: 8px 0;"><strong>${escapeHtml(formatTime(event.start, event.end))}</strong> — ${escapeHtml(event.title)}</li>`,
          )
          .join("")
      : "<li style=\"margin: 8px 0;\">No fixed commitments saved for today.</li>";
  const taskRows =
    openTasks.length > 0
      ? openTasks
          .map((task) => {
            const time = task.timeLabel ? `${escapeHtml(task.timeLabel)} — ` : "";
            return `<li style="margin: 8px 0;">${time}${escapeHtml(task.title)}</li>`;
          })
          .join("")
      : "<li style=\"margin: 8px 0;\">No extra tasks saved.</li>";
  const url = appUrl();
  const button = url
    ? `<p style="margin-top: 24px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Open Today</a></p>`
    : "";

  const delivery = await sendEmail({
    to: user.email,
    subject: `Your plan for ${brief.dateLabel}`,
    html: `
      <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#0f172a;">
        <p>Good morning${user.name?.trim() ? `, ${escapeHtml(user.name.trim())}` : ""}.</p>
        <div style="background:#ecfdf5;border:1px solid #99f6e4;border-radius:12px;padding:16px;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#0f766e;font-weight:700;">Main thing</div>
          <div style="margin-top:6px;font-size:18px;font-weight:700;">${escapeHtml(mainThing)}</div>
        </div>
        <h2 style="font-size:16px;margin:24px 0 8px;">Real-life schedule</h2>
        <ul style="padding-left:20px;margin:0;">${scheduleRows}</ul>
        <h2 style="font-size:16px;margin:24px 0 8px;">Tasks</h2>
        <ul style="padding-left:20px;margin:0;">${taskRows}</ul>
        ${button}
      </div>
    `,
  });
  if (delivery?.error) {
    throw new Error("Daily plan email provider rejected delivery.");
  }

  await prisma.dailyPlanningSettings.update({
    where: { userId: user.id },
    data: { lastEmailDate: today },
  });
  return { sent: true as const, to: user.email };
}
