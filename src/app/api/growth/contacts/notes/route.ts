import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  formatContactNotesForAgent,
  sanitizeNoteImages,
} from "@/lib/growth-contact-notes";
import { normalizeContactStatus } from "@/lib/growth-contact-shared";
import { userToday } from "@/lib/user-timezone";

/** Append a timestamped note (text and/or screenshots) to a contact. */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const contactId = typeof body.contactId === "string" ? body.contactId : "";
    const noteBody = typeof body.body === "string" ? body.body.trim() : "";
    const images = sanitizeNoteImages(body.images);
    const suggestedNextAction =
      typeof body.suggestedNextAction === "string"
        ? body.suggestedNextAction.trim().slice(0, 200) || null
        : undefined;
    const nextActionDate =
      typeof body.nextActionDate === "string" ? body.nextActionDate.trim() || null : undefined;
    const asksOffers =
      typeof body.asksOffers === "string"
        ? body.asksOffers.trim().slice(0, 400) || null
        : undefined;
    const mutualValue =
      typeof body.mutualValue === "string"
        ? body.mutualValue.trim().slice(0, 300) || null
        : undefined;
    const statusRaw = typeof body.status === "string" ? body.status.trim() : "";
    const status = statusRaw ? normalizeContactStatus(statusRaw) : undefined;
    const lastContactDate =
      typeof body.lastContactDate === "string" && body.lastContactDate.trim()
        ? body.lastContactDate.trim()
        : undefined;

    if (!contactId) {
      return NextResponse.json({ error: "Missing contactId" }, { status: 400 });
    }

    if (!noteBody && images.length === 0) {
      return NextResponse.json(
        { error: "Add some text or at least one screenshot." },
        { status: 400 },
      );
    }

    const userId = session.user.id;
    const contact = await prisma.growthContact.findFirst({
      where: { id: contactId, userId },
      include: {
        noteEntries: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const today = userToday();

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.growthContactNote.create({
        data: {
          contactId,
          userId,
          body: noteBody || null,
          images,
        },
      });

      const allEntries = [
        ...contact.noteEntries.map((e) => ({
          id: e.id,
          body: e.body,
          images: e.images,
          createdAt: e.createdAt,
        })),
        {
          id: created.id,
          body: created.body,
          images: created.images,
          createdAt: created.createdAt,
        },
      ];

      await tx.growthContact.update({
        where: { id: contactId },
        data: {
          notes: formatContactNotesForAgent(allEntries, null),
          lastContactDate: lastContactDate ?? today ?? contact.lastContactDate,
          ...(suggestedNextAction !== undefined
            ? { suggestedNextAction }
            : {}),
          ...(nextActionDate !== undefined ? { nextActionDate } : {}),
          ...(asksOffers !== undefined ? { asksOffers } : {}),
          ...(mutualValue !== undefined ? { mutualValue } : {}),
          ...(status ? { status } : {}),
        },
      });

      return created;
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error("Failed to add contact note:", error);
    return NextResponse.json({ error: "Failed to add note." }, { status: 500 });
  }
}
