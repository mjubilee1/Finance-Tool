import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  isLearningCategoryId,
  isLearningPriority,
  isLearningStatus,
  serializeContentItem,
} from "@/lib/learning-plan";
import { prisma } from "@/lib/prisma";

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 200) {
      return NextResponse.json(
        { error: "Title is required (max 200 characters)." },
        { status: 400 }
      );
    }

    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url || !isValidUrl(url)) {
      return NextResponse.json(
        { error: "A valid http(s) URL is required." },
        { status: 400 }
      );
    }

    const category = typeof body.category === "string" ? body.category.trim() : "";
    if (!isLearningCategoryId(category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }

    const durationMinutes = Number(body.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
      return NextResponse.json(
        { error: "Duration must be between 1 and 600 minutes." },
        { status: 400 }
      );
    }

    const priority =
      typeof body.priority === "string" && isLearningPriority(body.priority)
        ? body.priority
        : "medium";
    const status =
      typeof body.status === "string" && isLearningStatus(body.status)
        ? body.status
        : "saved";

    const item = await prisma.learningContentItem.create({
      data: {
        userId: session.user.id,
        title: title.slice(0, 200),
        url: url.slice(0, 2000),
        category,
        durationMinutes: Math.round(durationMinutes),
        priority,
        status,
        completedAt: status === "completed" ? new Date() : null,
      },
    });

    return NextResponse.json({ item: serializeContentItem(item) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create learning content:", error);
    return NextResponse.json({ error: "Failed to add content." }, { status: 500 });
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

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "Content id is required." }, { status: 400 });
    }

    const existing = await prisma.learningContentItem.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Content not found." }, { status: 404 });
    }

    const data: {
      title?: string;
      url?: string;
      category?: string;
      durationMinutes?: number;
      priority?: string;
      status?: string;
      completedAt?: Date | null;
    } = {};

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title || title.length > 200) {
        return NextResponse.json({ error: "Invalid title." }, { status: 400 });
      }
      data.title = title.slice(0, 200);
    }

    if (typeof body.url === "string") {
      const url = body.url.trim();
      if (!isValidUrl(url)) {
        return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
      }
      data.url = url.slice(0, 2000);
    }

    if (typeof body.category === "string") {
      if (!isLearningCategoryId(body.category)) {
        return NextResponse.json({ error: "Invalid category." }, { status: 400 });
      }
      data.category = body.category;
    }

    if (body.durationMinutes != null) {
      const durationMinutes = Number(body.durationMinutes);
      if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
        return NextResponse.json({ error: "Invalid duration." }, { status: 400 });
      }
      data.durationMinutes = Math.round(durationMinutes);
    }

    if (typeof body.priority === "string") {
      if (!isLearningPriority(body.priority)) {
        return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
      }
      data.priority = body.priority;
    }

    if (typeof body.status === "string") {
      if (!isLearningStatus(body.status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      data.status = body.status;
      if (body.status === "completed") {
        data.completedAt = existing.completedAt ?? new Date();
      } else if (existing.status === "completed") {
        data.completedAt = null;
      }
    }

    if (body.markComplete === true) {
      data.status = "completed";
      data.completedAt = existing.completedAt ?? new Date();
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    const item = await prisma.learningContentItem.update({
      where: { id: existing.id },
      data,
    });

    return NextResponse.json({ item: serializeContentItem(item) });
  } catch (error) {
    console.error("Failed to update learning content:", error);
    return NextResponse.json({ error: "Failed to update content." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ error: "Content id is required." }, { status: 400 });
    }

    const existing = await prisma.learningContentItem.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Content not found." }, { status: 404 });
    }

    await prisma.learningContentItem.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete learning content:", error);
    return NextResponse.json({ error: "Failed to delete content." }, { status: 500 });
  }
}
