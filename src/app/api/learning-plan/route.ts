import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  computeCategoryHours,
  computeLearningProgress,
  DEFAULT_CATEGORY_PERCENTAGES,
  DEFAULT_WEEKLY_HOURS,
  isLearningCategoryId,
  LEARNING_CATEGORIES,
  normalizeCategoryPercentages,
  percentagesAreValid,
  serializeContentItem,
  serializeSettings,
  sumPercentages,
  type CategoryPercentages,
} from "@/lib/learning-plan";
import { prisma } from "@/lib/prisma";

async function loadBundle(userId: string) {
  let settings = await prisma.learningPlanSettings.findUnique({
    where: { userId },
  });

  if (!settings) {
    settings = await prisma.learningPlanSettings.create({
      data: {
        userId,
        weeklyHours: DEFAULT_WEEKLY_HOURS,
        categoryPercentages: DEFAULT_CATEGORY_PERCENTAGES,
      },
    });
  }

  const items = await prisma.learningContentItem.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
  });

  const serializedSettings = serializeSettings(settings);
  const serializedItems = items.map(serializeContentItem);
  const percentagesValid = percentagesAreValid(serializedSettings.categoryPercentages);
  const percentTotal = Math.round(sumPercentages(serializedSettings.categoryPercentages) * 10) / 10;

  return {
    settings: serializedSettings,
    items: serializedItems,
    categoryHours: computeCategoryHours(
      serializedSettings.weeklyHours,
      serializedSettings.categoryPercentages
    ),
    progress: computeLearningProgress(serializedSettings.weeklyHours, serializedItems),
    percentagesValid,
    percentTotal,
    categories: LEARNING_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bundle = await loadBundle(session.user.id);
    return NextResponse.json(bundle);
  } catch (error) {
    console.error("Failed to load learning plan:", error);
    return NextResponse.json({ error: "Failed to load learning plan." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const existing = await prisma.learningPlanSettings.findUnique({
      where: { userId: session.user.id },
    });

    const data: {
      weeklyHours?: number;
      categoryPercentages?: CategoryPercentages;
      autoQueueYoutube?: boolean;
      autoStartYoutube?: boolean;
    } = {};

    if (body.weeklyHours != null) {
      const hours = Number(body.weeklyHours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
        return NextResponse.json(
          { error: "Weekly hours must be between 0 and 168." },
          { status: 400 }
        );
      }
      data.weeklyHours = Math.round(hours * 100) / 100;
    }

    if (typeof body.autoQueueYoutube === "boolean") {
      data.autoQueueYoutube = body.autoQueueYoutube;
    }

    if (typeof body.autoStartYoutube === "boolean") {
      data.autoStartYoutube = body.autoStartYoutube;
    }

    if (body.categoryPercentages != null) {
      if (typeof body.categoryPercentages !== "object" || Array.isArray(body.categoryPercentages)) {
        return NextResponse.json({ error: "Invalid category percentages." }, { status: 400 });
      }
      const next = normalizeCategoryPercentages(
        existing?.categoryPercentages ?? DEFAULT_CATEGORY_PERCENTAGES
      );
      const incoming = body.categoryPercentages as Record<string, unknown>;
      for (const [key, value] of Object.entries(incoming)) {
        if (!isLearningCategoryId(key)) {
          return NextResponse.json({ error: `Unknown category: ${key}` }, { status: 400 });
        }
        const num = Number(value);
        if (!Number.isFinite(num) || num < 0 || num > 100) {
          return NextResponse.json(
            { error: `Percentage for ${key} must be between 0 and 100.` },
            { status: 400 }
          );
        }
        next[key] = Math.round(num * 10) / 10;
      }
      data.categoryPercentages = next;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    if (existing) {
      await prisma.learningPlanSettings.update({
        where: { userId: session.user.id },
        data: {
          ...(data.weeklyHours != null ? { weeklyHours: data.weeklyHours } : {}),
          ...(data.categoryPercentages != null
            ? { categoryPercentages: data.categoryPercentages }
            : {}),
          ...(data.autoQueueYoutube != null
            ? { autoQueueYoutube: data.autoQueueYoutube }
            : {}),
          ...(data.autoStartYoutube != null
            ? { autoStartYoutube: data.autoStartYoutube }
            : {}),
        },
      });
    } else {
      await prisma.learningPlanSettings.create({
        data: {
          userId: session.user.id,
          weeklyHours: data.weeklyHours ?? DEFAULT_WEEKLY_HOURS,
          categoryPercentages: data.categoryPercentages ?? DEFAULT_CATEGORY_PERCENTAGES,
          autoQueueYoutube: data.autoQueueYoutube ?? true,
          autoStartYoutube: data.autoStartYoutube ?? true,
        },
      });
    }

    const bundle = await loadBundle(session.user.id);
    return NextResponse.json(bundle);
  } catch (error) {
    console.error("Failed to update learning plan:", error);
    return NextResponse.json({ error: "Failed to update learning plan." }, { status: 500 });
  }
}
