import { createReadStream, existsSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCarDocument } from "@/lib/car";
import { Readable } from "stream";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const doc = getCarDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const filePath = path.join(process.cwd(), "storage", "car-documents", doc.filename);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Document file missing on server." }, { status: 404 });
    }

    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Failed to serve car document:", error);
    return NextResponse.json({ error: "Failed to load document." }, { status: 500 });
  }
}
