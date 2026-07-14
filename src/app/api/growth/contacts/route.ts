import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatContactNotesForAgent } from "@/lib/growth-contact-notes";

const contactInclude = {
  noteEntries: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
  },
};

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lite = searchParams.get("lite") === "1";

    if (lite) {
      const contacts = await prisma.growthContact.findMany({
        where: { userId: session.user.id },
        orderBy: [{ lastContactDate: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          relationshipType: true,
          lastContactDate: true,
          status: true,
        },
      });
      return NextResponse.json({ contacts });
    }

    const contacts = await prisma.growthContact.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: contactInclude,
    });

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error("Failed to fetch growth contacts:", error);
    return NextResponse.json({ error: "Failed to fetch contacts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      relationshipType,
      trustLevel = 3,
      sharedInterests,
      collaborationPotential = 3,
      lastContactDate,
      suggestedNextAction,
      mutualValue,
      notes,
      status = "active",
    } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const userId = session.user.id;
    const initialNotes = typeof notes === "string" ? notes.trim() : "";

    const contact = await prisma.$transaction(async (tx) => {
      const created = await tx.growthContact.create({
        data: {
          userId,
          name: name.trim(),
          relationshipType: relationshipType || null,
          trustLevel: Math.max(1, Math.min(5, parseInt(String(trustLevel), 10) || 3)),
          sharedInterests: sharedInterests || null,
          collaborationPotential: Math.max(
            1,
            Math.min(5, parseInt(String(collaborationPotential), 10) || 3),
          ),
          lastContactDate: lastContactDate || null,
          suggestedNextAction: suggestedNextAction || null,
          mutualValue: mutualValue || null,
          notes: initialNotes || null,
          status: ["active", "fading", "dormant"].includes(status) ? status : "active",
        },
      });

      if (initialNotes) {
        const entry = await tx.growthContactNote.create({
          data: {
            contactId: created.id,
            userId,
            body: initialNotes,
            images: [],
          },
        });
        await tx.growthContact.update({
          where: { id: created.id },
          data: {
            notes: formatContactNotesForAgent(
              [
                {
                  id: entry.id,
                  body: entry.body,
                  images: entry.images,
                  createdAt: entry.createdAt,
                },
              ],
              null,
            ),
          },
        });
      }

      return tx.growthContact.findUniqueOrThrow({
        where: { id: created.id },
        include: contactInclude,
      });
    });

    return NextResponse.json({ contact });
  } catch (error) {
    console.error("Failed to create growth contact:", error);
    return NextResponse.json({ error: "Failed to create contact." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...rest } = body as Record<string, unknown>;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (typeof rest.name === "string") data.name = rest.name.trim();
    if (typeof rest.relationshipType === "string") data.relationshipType = rest.relationshipType;
    if (rest.trustLevel !== undefined) {
      data.trustLevel = Math.max(1, Math.min(5, parseInt(String(rest.trustLevel), 10) || 3));
    }
    if (typeof rest.sharedInterests === "string") data.sharedInterests = rest.sharedInterests;
    if (rest.collaborationPotential !== undefined) {
      data.collaborationPotential = Math.max(
        1,
        Math.min(5, parseInt(String(rest.collaborationPotential), 10) || 3),
      );
    }
    if (typeof rest.lastContactDate === "string") data.lastContactDate = rest.lastContactDate;
    if (typeof rest.suggestedNextAction === "string") {
      data.suggestedNextAction = rest.suggestedNextAction;
    }
    if (typeof rest.mutualValue === "string") data.mutualValue = rest.mutualValue;
    // Notes are append-only via POST /api/growth/contacts/notes
    if (typeof rest.status === "string" && ["active", "fading", "dormant"].includes(rest.status)) {
      data.status = rest.status;
    }

    const updated = await prisma.growthContact.updateMany({
      where: { id, userId: session.user.id },
      data,
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update growth contact:", error);
    return NextResponse.json({ error: "Failed to update contact." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    await prisma.growthContact.deleteMany({
      where: { id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete growth contact:", error);
    return NextResponse.json({ error: "Failed to delete contact." }, { status: 500 });
  }
}
