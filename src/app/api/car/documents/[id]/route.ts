import { createReadStream } from "fs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCarDocument } from "@/lib/car";
import { resolveCarDocumentFile } from "@/lib/car-documents-path";
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

    const { dir, filePath, exists } = resolveCarDocumentFile(doc.filename);
    if (!exists) {
      console.error(
        `[CAR DOCS] missing id=${doc.id} filename=${doc.filename} dir=${dir} cwd=${process.cwd()}`,
      );
      return NextResponse.json(
        {
          error:
            "Document file missing on server. Hardcoded catalog expects the PDF under storage/car-documents/ — copy it there (and redeploy if this is production).",
        },
        { status: 404 },
      );
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
