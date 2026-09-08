import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const domains = [
  "career",
  "business",
  "real_estate",
  "network",
  "health",
  "financial",
  "personal",
] as const;
const statuses = ["unstable", "stabilizing", "operational", "scaling"] as const;

const createSystemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  domain: z.enum(domains),
  status: z.enum(statuses).default("unstable"),
  currentState: z.string().trim().min(1).max(1000),
  targetState: z.string().trim().min(1).max(1000),
  progress: z.coerce.number().min(0).max(100).default(0),
  nextAction: z.string().trim().max(500).optional().nullable(),
  blocker: z.string().trim().max(1000).optional().nullable(),
  deadline: z.string().trim().max(10).optional().nullable(),
});

const updateSystemSchema = createSystemSchema
  .partial()
  .extend({
    id: z.string().min(1),
    note: z.string().trim().max(1000).optional().nullable(),
    isArchived: z.boolean().optional(),
  });

function emptyToNull(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const systems = await prisma.operatingSystem.findMany({
    where: { userId: session.user.id, isArchived: false },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: { history: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  return NextResponse.json({ systems });
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = createSystemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the system details and try again." },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const system = await prisma.$transaction(async (tx) => {
      const created = await tx.operatingSystem.create({
        data: {
          userId: session.user.id,
          name: input.name,
          domain: input.domain,
          status: input.status,
          currentState: input.currentState,
          targetState: input.targetState,
          progress: input.progress,
          nextAction: emptyToNull(input.nextAction),
          blocker: emptyToNull(input.blocker),
          deadline: emptyToNull(input.deadline),
        },
      });
      await tx.operatingSystemUpdate.create({
        data: {
          userId: session.user.id,
          systemId: created.id,
          status: created.status,
          progress: created.progress,
          currentState: created.currentState,
          note: "System created",
        },
      });
      return created;
    });

    return NextResponse.json({ system }, { status: 201 });
  } catch (error) {
    console.error("Failed to create operating system:", error);
    return NextResponse.json({ error: "Failed to create system." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = updateSystemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the system update and try again." },
        { status: 400 },
      );
    }

    const { id, note, ...changes } = parsed.data;
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.operatingSystem.findFirst({
        where: { id, userId: session.user.id },
      });
      if (!existing) return null;

      const system = await tx.operatingSystem.update({
        where: { id },
        data: {
          ...changes,
          nextAction:
            changes.nextAction === undefined
              ? undefined
              : emptyToNull(changes.nextAction),
          blocker:
            changes.blocker === undefined ? undefined : emptyToNull(changes.blocker),
          deadline:
            changes.deadline === undefined ? undefined : emptyToNull(changes.deadline),
        },
      });
      await tx.operatingSystemUpdate.create({
        data: {
          userId: session.user.id,
          systemId: system.id,
          status: system.status,
          progress: system.progress,
          currentState: system.currentState,
          note: emptyToNull(note),
        },
      });
      return system;
    });

    if (!updated) {
      return NextResponse.json({ error: "System not found." }, { status: 404 });
    }
    return NextResponse.json({ system: updated });
  } catch (error) {
    console.error("Failed to update operating system:", error);
    return NextResponse.json({ error: "Failed to update system." }, { status: 500 });
  }
}
